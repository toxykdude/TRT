/**
 * Retrieval layer — the three knowledge sources behind the MCP tools.
 *
 *   1. Layer 1: @trt/kb KbStore (deterministic BM25 over the corpus, SQLite).
 *   2. Layer 2: the local graph query service (:8001) over the Graphiti/Neo4j
 *      graph (same service the web app uses; embeddings match ingestion).
 *   3. Platform: repo documents (GOLD.md, docs/*) + engine metadata.
 *
 * Everything degrades gracefully: a missing KB or an unreachable graph returns
 * a structured status, never a thrown error that would break an MCP session.
 */
import { KbStore, type KbDocument, type KbPassage } from '@trt/kb';
import { GRAPH_QUERY_URL, KB_DB_PATH, kbDatabaseExists } from './config.js';

// ── Layer 1: deterministic KB ────────────────────────────────────────────────

let _store: KbStore | null = null;
let _storeTried = false;

/** Lazily open the KB store. Returns null when the DB file is missing/unreadable. */
export function getKbStore(): KbStore | null {
  if (_storeTried) return _store;
  _storeTried = true;
  if (!kbDatabaseExists()) return null;
  try {
    _store = new KbStore(KB_DB_PATH);
  } catch {
    _store = null;
  }
  return _store;
}

/** Reset the cached store (tests). */
export function resetKbStore(): void {
  try {
    _store?.close();
  } catch {
    /* already closed */
  }
  _store = null;
  _storeTried = false;
}

export type KbStatus =
  | { available: true; documents: number; passages: number }
  | { available: false; reason: 'not_built' };

export function kbStatus(): KbStatus {
  const store = getKbStore();
  if (!store) return { available: false, reason: 'not_built' };
  try {
    return { available: true, documents: store.docCount(), passages: store.chunkCount() };
  } catch {
    return { available: false, reason: 'not_built' };
  }
}

export function kbSearch(query: string, k: number): KbPassage[] {
  const store = getKbStore();
  if (!store) return [];
  try {
    return store.search(query, k);
  } catch {
    return [];
  }
}

export function kbDocuments(): KbDocument[] {
  const store = getKbStore();
  if (!store) return [];
  try {
    return store.listDocuments();
  } catch {
    return [];
  }
}

export function kbPassage(chunkId: number): KbPassage | null {
  const store = getKbStore();
  if (!store) return null;
  try {
    return store.getPassage(chunkId);
  } catch {
    return null;
  }
}

// ── Layer 2: Graphiti knowledge graph (via the local query service) ──────────

export type GraphFact = { fact: string; source?: string; score?: number };

export type GraphStatus =
  | { available: true; backend?: string; embedder?: string }
  | { available: false; reason: 'unconfigured' | 'unreachable' | 'not_built' };

export async function graphStatus(): Promise<GraphStatus> {
  if (!GRAPH_QUERY_URL) return { available: false, reason: 'unconfigured' };
  try {
    const res = await fetch(`${GRAPH_QUERY_URL}/health`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { available: false, reason: 'unreachable' };
    const detail = (await res.json().catch(() => ({}))) as { backend?: string; embedder?: string };
    return { available: true, backend: detail.backend, embedder: detail.embedder };
  } catch {
    return { available: false, reason: 'unreachable' };
  }
}

export async function graphSearchFacts(
  query: string,
  k: number,
): Promise<{ facts: GraphFact[]; status: GraphStatus }> {
  const status = await graphStatus();
  if (!status.available) return { facts: [], status };
  try {
    const res = await fetch(`${GRAPH_QUERY_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({ query, k }),
    });
    if (!res.ok) return { facts: [], status: { available: false, reason: 'unreachable' } };
    const data = (await res.json()) as { results?: GraphFact[] };
    const facts = (data.results ?? []).slice(0, k);
    if (facts.length === 0) return { facts: [], status: { available: false, reason: 'not_built' } };
    return { facts, status };
  } catch {
    return { facts: [], status: { available: false, reason: 'unreachable' } };
  }
}
