/**
 * @trt/kb — deterministic knowledge base (Goal 1) + optional Graphiti graph (Goal 2).
 *
 * Public API for the engine:
 *   • searchReferences(query) — deterministic KB (TF-IDF/BM25) → cited passages
 *   • searchGraphFacts(query) — optional Graphiti graph facts (graceful fallback)
 *
 * The deterministic KB is the always-available, fully-reproducible primary.
 * Graphiti enhances when its graph is built (one-time LLM ingestion, then frozen).
 */
export { extractDocument, extractAndStore, slugify, titleFromPath } from './extract';
export type { ExtractedDoc } from './extract';
export { KbStore } from './store';
export type { KbDocument, KbPassage } from './store';
export { searchFacts as searchGraphFacts, graphitiStatus } from './graphiti';
export type { GraphitiResult, GraphitiStatus } from './graphiti';

import { KbStore, type KbPassage } from './store';
import { searchFacts } from './graphiti';

let _store: KbStore | null = null;

/** Lazily open the singleton KB store (path from env, default location). */
export function getStore(): KbStore {
  if (_store) return _store;
  const path = process.env.KB_DB_PATH || '/var/lib/trt/kb/knowledge.db';
  _store = new KbStore(path);
  return _store;
}

/** Close the singleton store (tests / shutdown). */
export function closeStore() {
  if (_store) {
    _store.close();
    _store = null;
  }
}

/**
 * Deterministic KB search for cited reference passages.
 * The primary knowledge source — no model, fully reproducible.
 */
export function searchReferences(query: string, k = 3): KbPassage[] {
  try {
    return getStore().search(query, k);
  } catch {
    // KB not built yet — return empty rather than crash the report.
    return [];
  }
}

/**
 * Combined search: deterministic passages always; Graphiti facts when available.
 * Graphiti is optional and never blocks the deterministic result.
 */
export async function searchAll(query: string, k = 3): Promise<{
  references: KbPassage[];
  graphFacts: Awaited<ReturnType<typeof searchFacts>>['results'];
  graphAvailable: boolean;
}> {
  const references = searchReferences(query, k);
  const { results, status } = await searchFacts(query, k);
  return { references, graphFacts: results, graphAvailable: status.available };
}
