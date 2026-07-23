/**
 * MCP tools — read-only retrieval over the TRT knowledge stack.
 *
 * Handlers are plain async functions returning MCP content blocks, so they are
 * unit-testable without a transport. `registerTools(server)` wires them up.
 *
 * Contract (GOLD §2): every tool returns CITED SOURCE MATERIAL plus the
 * mandatory disclaimer. No tool generates advice, and no tool touches the
 * patient database (no PHI crosses this surface).
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BIOMARKER_DISPLAY_NAMES, SEARCH_PHRASES } from '@trt/engine';
import { GRAPH_QUERY_URL, KB_DB_PATH, MCP_HTTP_PORT } from './config.js';
import { DISCLAIMER } from './safety.js';
import {
  graphSearchFacts,
  graphStatus,
  kbDocuments,
  kbPassage,
  kbSearch,
  kbStatus,
} from './retrieval.js';
import { biomarkerCategories, engineMetadata, platformServices } from './platform.js';

// ── Response shaping ─────────────────────────────────────────────────────────

type TextContent = { type: 'text'; text: string };
export type ToolResponse = { content: TextContent[]; isError?: boolean };

/** Attach the mandatory disclaimer and serialize (clinical content rule, GOLD §2.5). */
function respond(payload: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ...payload, disclaimer: DISCLAIMER }, null, 2) }],
  };
}

function fail(message: string): ToolResponse {
  return { content: [{ type: 'text', text: message }], isError: true };
}

const querySchema = {
  query: z.string().min(2).describe('What to look up (natural language or keywords)'),
  k: z.number().int().min(1).max(25).optional().describe('Max results (default 5)'),
};

// ── Tool handlers (pure, transport-free) ─────────────────────────────────────

export async function handleSearchKnowledgeBase(args: { query: string; k?: number }): Promise<ToolResponse> {
  const k = args.k ?? 5;
  const status = kbStatus();
  if (!status.available) {
    return respond({
      layer: 'deterministic-corpus-kb',
      available: false,
      note: `KB not built at ${KB_DB_PATH} — see docs/RAG.md (Layer 1 build).`,
      results: [],
    });
  }
  const hits = kbSearch(args.query, k);
  return respond({
    layer: 'deterministic-corpus-kb',
    available: true,
    query: args.query,
    count: hits.length,
    results: hits.map((h) => ({
      chunkId: h.chunkId,
      document: h.documentTitle,
      page: h.page,
      score: Number(h.score.toFixed(4)),
      passage: h.text,
    })),
  });
}

export async function handleSearchKnowledgeGraph(args: { query: string; k?: number }): Promise<ToolResponse> {
  const k = args.k ?? 5;
  const { facts, status } = await graphSearchFacts(args.query, k);
  if (!status.available) {
    return respond({
      layer: 'knowledge-graph',
      available: false,
      reason: status.reason,
      note: `graph query service at ${GRAPH_QUERY_URL} — see docs/RAG.md (Layer 2).`,
      results: [],
    });
  }
  return respond({
    layer: 'knowledge-graph',
    available: true,
    query: args.query,
    count: facts.length,
    results: facts,
  });
}

export async function handleSearchAll(args: { query: string; k?: number }): Promise<ToolResponse> {
  const k = args.k ?? 5;
  const kb = kbStatus();
  const hits = kb.available ? kbSearch(args.query, k) : [];
  const { facts, status: graph } = await graphSearchFacts(args.query, k);
  return respond({
    query: args.query,
    corpusKB: {
      available: kb.available,
      count: hits.length,
      results: hits.map((h) => ({
        chunkId: h.chunkId,
        document: h.documentTitle,
        page: h.page,
        score: Number(h.score.toFixed(4)),
        passage: h.text,
      })),
    },
    knowledgeGraph: {
      available: graph.available,
      ...(graph.available ? {} : { reason: graph.reason }),
      count: facts.length,
      results: facts,
    },
  });
}

export async function handleListCorpusDocuments(): Promise<ToolResponse> {
  const status = kbStatus();
  if (!status.available) {
    return respond({ available: false, note: 'KB not built — see docs/RAG.md.', documents: [] });
  }
  const docs = kbDocuments();
  return respond({
    available: true,
    documentCount: docs.length,
    passageCount: status.passages,
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      method: d.method,
      pages: d.pages,
      charCount: d.charCount,
    })),
  });
}

export async function handleGetPassage(args: { chunkId: number }): Promise<ToolResponse> {
  if (!kbStatus().available) return respond({ available: false, note: 'KB not built.', passage: null });
  const p = kbPassage(args.chunkId);
  if (!p) return fail(`No passage with chunkId ${args.chunkId}.`);
  return respond({
    available: true,
    passage: {
      chunkId: p.chunkId,
      document: p.documentTitle,
      page: p.page,
      ordinal: p.ordinal,
      text: p.text,
    },
  });
}

export async function handleGetRagStatus(): Promise<ToolResponse> {
  const kb = kbStatus();
  const graph = await graphStatus();
  return respond({
    deterministicKB: kb.available
      ? { available: true, dbPath: KB_DB_PATH, documents: kb.documents, passages: kb.passages }
      : { available: false, dbPath: KB_DB_PATH, reason: kb.reason },
    knowledgeGraph: graph.available
      ? { available: true, url: GRAPH_QUERY_URL, backend: graph.backend, embedder: graph.embedder }
      : { available: false, url: GRAPH_QUERY_URL, reason: graph.reason },
  });
}

export async function handleGetPlatformInfo(args: {
  section?: 'overview' | 'architecture' | 'engine' | 'docs';
}): Promise<ToolResponse> {
  const section = args.section ?? 'overview';
  const base = {
    product: 'TRT Clinical Decision Support Dashboard',
    mission:
      'Organizes fragmented lab results into a normalized timeline and a deterministic, ' +
      'clinician-ready report. Clinical decision SUPPORT only — not a prescribing or diagnostic system (GOLD §2).',
    docsAvailable: ['gold', 'agents', 'readme', 'docs/engine', 'docs/rag', 'docs/deployment', 'docs/mcp'],
  };
  if (section === 'architecture') {
    return respond({ ...base, services: platformServices(), mcpHttpPort: MCP_HTTP_PORT });
  }
  if (section === 'engine') {
    return respond({ ...base, engine: engineMetadata() });
  }
  if (section === 'docs') {
    return respond({
      ...base,
      resources: [
        'trt://platform/gold',
        'trt://platform/agents',
        'trt://platform/readme',
        'trt://platform/docs/{engine,rag,deployment,mcp}',
        'trt://kb/documents',
        'trt://kb/status',
      ],
    });
  }
  return respond({
    ...base,
    services: platformServices(),
    engineSummary: { pipeline: engineMetadata().pipeline, determinism: engineMetadata().determinism },
    hint: 'Use section=architecture|engine|docs for focused views; read trt://platform/* resources for the documents.',
  });
}

export async function handleLookupBiomarker(args: { key: string; k?: number }): Promise<ToolResponse> {
  const key = args.key.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const display = BIOMARKER_DISPLAY_NAMES[key] ?? null;
  const categories = biomarkerCategories(key);
  const phrase = SEARCH_PHRASES[key] ?? key.replace(/_/g, ' ');
  const k = args.k ?? 3;
  const references = kbStatus().available
    ? kbSearch(phrase, k).map((h) => ({ document: h.documentTitle, page: h.page, chunkId: h.chunkId }))
    : [];
  const { facts, status: graph } = await graphSearchFacts(phrase, k);
  return respond({
    biomarkerKey: key,
    displayName: display,
    panelCategories: categories,
    known: display !== null || categories.length > 0 || key in SEARCH_PHRASES,
    kbSearchPhrase: phrase,
    topReferences: references,
    graphFacts: graph.available ? facts : [],
    note:
      'Reference ranges are per-lab/per-assay (GOLD §5.7). Use search_all with the phrase for full cited passages.',
  });
}

// ── Registration ─────────────────────────────────────────────────────────────

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** Register every retrieval tool on the server. */
export function registerTools(server: McpServer): void {
  server.registerTool(
    'search_knowledge_base',
    {
      title: 'Search corpus knowledge base',
      description:
        'Deterministic BM25 search over the indexed medical corpus (Layer 1). ' +
        'Returns cited passages with document title, page, and relevance score. ' +
        'Source material only — never advice.',
      inputSchema: querySchema,
      annotations: READ_ONLY,
    },
    handleSearchKnowledgeBase,
  );

  server.registerTool(
    'search_knowledge_graph',
    {
      title: 'Search Graphiti knowledge graph',
      description:
        'Semantic search over the Graphiti/Neo4j knowledge graph (Layer 2). ' +
        'Returns entity relationship facts (e.g. how compounds, biomarkers, and ' +
        'conditions relate). Source material only — never advice.',
      inputSchema: querySchema,
      annotations: READ_ONLY,
    },
    handleSearchKnowledgeGraph,
  );

  server.registerTool(
    'search_all',
    {
      title: 'Search all knowledge layers',
      description:
        'One query across both layers: deterministic corpus KB passages AND ' +
        'knowledge-graph relationship facts. Best first stop for any question ' +
        'about the TRT knowledge base.',
      inputSchema: querySchema,
      annotations: READ_ONLY,
    },
    handleSearchAll,
  );

  server.registerTool(
    'list_corpus_documents',
    {
      title: 'List corpus documents',
      description:
        'List every source document indexed in the knowledge base (id, title, ' +
        'extraction method, page/char counts), so you know what the corpus covers.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    handleListCorpusDocuments,
  );

  server.registerTool(
    'get_passage',
    {
      title: 'Get passage by chunk id',
      description:
        'Fetch the full text of one knowledge-base passage by its chunkId (from a ' +
        'prior search hit), with its citation. Use to read a hit in full.',
      inputSchema: { chunkId: z.number().int().min(1).describe('chunkId from a search result') },
      annotations: READ_ONLY,
    },
    handleGetPassage,
  );

  server.registerTool(
    'get_rag_status',
    {
      title: 'RAG stack status',
      description:
        'Availability and stats for both knowledge layers: deterministic KB ' +
        '(documents/passages) and the knowledge-graph query service.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    handleGetRagStatus,
  );

  server.registerTool(
    'get_platform_info',
    {
      title: 'Platform information',
      description:
        'What the TRT platform is, its service map, and how the deterministic ' +
        'analysis engine works. Optional section: overview | architecture | engine | docs.',
      inputSchema: {
        section: z.enum(['overview', 'architecture', 'engine', 'docs']).optional(),
      },
      annotations: READ_ONLY,
    },
    handleGetPlatformInfo,
  );

  server.registerTool(
    'lookup_biomarker',
    {
      title: 'Look up a biomarker',
      description:
        'Resolve a biomarker key (e.g. hematocrit, estradiol_sensitive): display ' +
        'name, expected-panel categories, the KB search phrase, top cited ' +
        'references, and related graph facts.',
      inputSchema: {
        key: z.string().min(2).describe('Biomarker key or name, e.g. "shbg" or "free t3"'),
        k: z.number().int().min(1).max(10).optional().describe('Max references/facts (default 3)'),
      },
      annotations: READ_ONLY,
    },
    handleLookupBiomarker,
  );
}
