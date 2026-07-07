/**
 * Graphiti MCP client — Goal 2.
 *
 * Talks to the Graphiti MCP server (HTTP transport) to query the knowledge
 * graph built from the corpus. The graph is built ONCE (during ingestion, which
 * uses an LLM) and then FROZEN — at query time only embeddings + graph traversal
 * run on the Graphiti side (no generative LLM), so runtime stays deterministic.
 *
 * Graceful fallback: if the MCP server is unreachable, the graph is empty, or
 * no LLM key was ever set (graph never built), queries return an empty result
 * with a status note instead of throwing. The deterministic KB (@trt/store) is
 * the always-available primary; Graphiti is the optional enhancement.
 */
export type GraphitiResult = {
  fact: string;
  source?: string;
  score?: number;
};

export type GraphitiStatus =
  | { available: true }
  | { available: false; reason: 'unconfigured' | 'unreachable' | 'not_built' };

const MCP_URL = process.env.GRAPHITI_MCP_URL || ''; // e.g. http://127.0.0.1:8000

export async function graphitiStatus(): Promise<GraphitiStatus> {
  if (!MCP_URL) return { available: false, reason: 'unconfigured' };
  try {
    const res = await fetch(`${MCP_URL}/healthcheck`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { available: false, reason: 'unreachable' };
    // Optionally check graph has content via get_status tool — omitted for simplicity.
    return { available: true };
  } catch {
    return { available: false, reason: 'unreachable' };
  }
}

/**
 * Search the Graphiti knowledge graph for relationship facts relevant to a query.
 * Returns [] (with a swallowed status) if the graph isn't built/available.
 */
export async function searchFacts(query: string, limit = 5): Promise<{
  results: GraphitiResult[];
  status: GraphitiStatus;
}> {
  const status = await graphitiStatus();
  if (!status.available) return { results: [], status };

  try {
    // Graphiti MCP HTTP transport accepts JSON-RPC tool calls.
    const res = await fetch(`${MCP_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'search_facts',
          arguments: { query, num_results: limit },
        },
      }),
    });
    if (!res.ok) return { results: [], status: { available: false, reason: 'unreachable' } };
    const data = (await res.json()) as { result?: { content?: Array<{ text?: string }> } };
    const text = data.result?.content?.[0]?.text ?? '[]';
    const facts = safeParseFacts(text);
    return { results: facts.slice(0, limit), status };
  } catch {
    return { results: [], status: { available: false, reason: 'unreachable' } };
  }
}

function safeParseFacts(text: string): GraphitiResult[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((f) => {
      const o = f as Record<string, unknown>;
      return {
        fact: String(o.fact ?? o.fact_text ?? o.text ?? JSON.stringify(o)),
        source: o.source ? String(o.source) : undefined,
        score: typeof o.score === 'number' ? o.score : undefined,
      };
    });
  } catch {
    return [{ fact: text }];
  }
}
