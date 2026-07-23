#!/usr/bin/env tsx
/**
 * Live smoke test for a deployed TRT MCP server (Streamable HTTP).
 *
 * Usage:
 *   node_modules/.bin/tsx scripts/mcp-smoke.ts [url]
 *   MCP_AUTH_TOKEN=... node_modules/.bin/tsx scripts/mcp-smoke.ts http://127.0.0.1:8002/mcp
 *
 * Exits non-zero if any check fails. Safe to run against production: read-only.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2] ?? 'http://127.0.0.1:8002/mcp';
const token = process.env.MCP_AUTH_TOKEN;

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
});
const client = new Client({ name: 'trt-mcp-smoke', version: '0.1.0' });

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function textOf(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }> };
  return r.content?.find((c) => c.type === 'text')?.text ?? '';
}

async function main() {
  await client.connect(transport);
  check(
    'initialize',
    true,
    `${client.getServerVersion()?.name} v${client.getServerVersion()?.version}`,
  );

  const { tools } = await client.listTools();
  check('tools/list (>= 8)', tools.length >= 8, tools.map((t) => t.name).join(', '));

  const status = await client.callTool({ name: 'get_rag_status', arguments: {} });
  const statusPayload = JSON.parse(textOf(status)) as {
    deterministicKB: { available: boolean; documents?: number };
    knowledgeGraph: { available: boolean };
  };
  check(
    'get_rag_status: KB available',
    statusPayload.deterministicKB.available,
    `documents=${statusPayload.deterministicKB.documents}`,
  );
  check('get_rag_status: graph available', statusPayload.knowledgeGraph.available);

  const kb = await client.callTool({
    name: 'search_knowledge_base',
    arguments: { query: 'hematocrit polycythemia', k: 3 },
  });
  const kbPayload = JSON.parse(textOf(kb)) as {
    available: boolean;
    count: number;
    disclaimer?: string;
  };
  check(
    'search_knowledge_base returns cited passages',
    kbPayload.available && kbPayload.count > 0,
    `count=${kbPayload.count}`,
  );
  check(
    'response carries GOLD §2.5 disclaimer',
    typeof kbPayload.disclaimer === 'string' &&
      kbPayload.disclaimer.includes('qualified healthcare professional'),
  );

  const graph = await client.callTool({
    name: 'search_knowledge_graph',
    arguments: { query: 'testosterone estradiol aromatase', k: 3 },
  });
  const graphPayload = JSON.parse(textOf(graph)) as { available: boolean; count: number };
  check(
    'search_knowledge_graph returns facts',
    graphPayload.available && graphPayload.count > 0,
    `count=${graphPayload.count}`,
  );

  const all = await client.callTool({
    name: 'search_all',
    arguments: { query: 'shbg free testosterone', k: 2 },
  });
  const allPayload = JSON.parse(textOf(all)) as {
    corpusKB: { count: number };
    knowledgeGraph: { count: number };
  };
  check(
    'search_all fans out both layers',
    allPayload.corpusKB.count >= 0 && allPayload.knowledgeGraph.count >= 0,
  );

  const gold = await client.readResource({ uri: 'trt://platform/gold' });
  const goldText = (gold.contents[0] as { text?: string }).text ?? '';
  check('resources/read trt://platform/gold', goldText.length > 500);

  const prompt = await client.getPrompt({
    name: 'trt_knowledge_query',
    arguments: { question: 'hematocrit monitoring' },
  });
  check(
    'prompts/get trt_knowledge_query',
    JSON.stringify(prompt).includes('qualified healthcare professional'),
  );

  await client.close();
  console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED (${failures} checks)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('SMOKE ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
