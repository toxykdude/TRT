/**
 * Knowledge-graph query client (Goal 2).
 *
 * Talks to the LOCAL graph query service (scripts/graph_query_service.py on
 * :8001), which uses the SAME local embedder (sentence-transformers) used at
 * ingestion to query FalkorDB directly. This keeps embeddings consistent and
 * avoids the Graphiti docker MCP, which is hardcoded to an OpenAI embeddings
 * endpoint that Z.AI doesn't offer.
 *
 * Graceful fallback: if the service is down, the graph is empty, or ingestion
 * hasn't run, queries return [] with a status note. Layer 1 (deterministic KB)
 * always carries the report regardless.
 */
export type GraphitiResult = {
  fact: string;
  source?: string;
  score?: number;
};

export type GraphitiStatus =
  | { available: true }
  | { available: false; reason: 'unconfigured' | 'unreachable' | 'not_built' };

// The local query service (sentence-transformers + FalkorDB).
const GRAPH_URL = process.env.GRAPH_QUERY_URL || process.env.GRAPHITI_MCP_URL || '';

export async function graphitiStatus(): Promise<GraphitiStatus> {
  if (!GRAPH_URL) return { available: false, reason: 'unconfigured' };
  try {
    const res = await fetch(`${GRAPH_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { available: false, reason: 'unreachable' };
    return { available: true };
  } catch {
    return { available: false, reason: 'unreachable' };
  }
}

/**
 * Search the knowledge graph for relationship facts relevant to a query.
 * Returns [] (with a swallowed status) if the graph isn't built/available.
 */
export async function searchFacts(query: string, limit = 5): Promise<{
  results: GraphitiResult[];
  status: GraphitiStatus;
}> {
  const status = await graphitiStatus();
  if (!status.available) return { results: [], status };

  try {
    const res = await fetch(`${GRAPH_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ query, k: limit }),
    });
    if (!res.ok) return { results: [], status: { available: false, reason: 'unreachable' } };
    const data = (await res.json()) as { results?: GraphitiResult[] };
    const results = data.results ?? [];
    if (results.length === 0) return { results: [], status: { available: false, reason: 'not_built' } };
    return { results: results.slice(0, limit), status };
  } catch {
    return { results: [], status: { available: false, reason: 'unreachable' } };
  }
}
