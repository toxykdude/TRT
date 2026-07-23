/**
 * Protocol-level test — a real MCP client over an in-memory transport,
 * exercising tools/list, tools/call, resources/list, resources/read, and
 * prompts/get against a temporary KB.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const tmp = mkdtempSync(join(tmpdir(), 'trt-mcp-proto-'));
process.env.KB_DB_PATH = join(tmp, 'knowledge.db');
process.env.GRAPH_QUERY_URL = 'http://127.0.0.1:9'; // unreachable

type Client = import('@modelcontextprotocol/sdk/client/index.js').Client;
let client: Client;
let serverClose: () => Promise<void>;

function firstText(result: unknown): string {
  const r = result as { content: Array<{ type: string; text?: string }> };
  return r.content.find((c) => c.type === 'text')?.text ?? '';
}

beforeAll(async () => {
  const { KbStore } = await import('@trt/kb');
  const store = new KbStore(process.env.KB_DB_PATH!);
  store.indexDocument({
    title: 'Protocol Test Doc',
    sourcePath: '/corpus/proto.pdf',
    contentHash: 'hash-p',
    method: 'pdftotext',
    pages: 1,
    text:
      'SHBG binds testosterone and lowers free testosterone. ' +
      'Hematocrit monitoring is discussed in clinical follow-up guidance.',
  });
  store.close();

  const [{ createServer }, { Client: ClientCtor }, { InMemoryTransport }] = await Promise.all([
    import('./server.js'),
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/inMemory.js'),
  ]);
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new ClientCtor({ name: 'trt-mcp-test', version: '0.0.1' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  serverClose = () => server.close();
});

afterAll(async () => {
  await client.close();
  await serverClose();
  rmSync(tmp, { recursive: true, force: true });
});

describe('MCP protocol end-to-end', () => {
  it('lists all 8 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'get_passage',
      'get_platform_info',
      'get_rag_status',
      'list_corpus_documents',
      'lookup_biomarker',
      'search_all',
      'search_knowledge_base',
      'search_knowledge_graph',
    ]);
  });

  it('calls search_knowledge_base over the wire', async () => {
    const res = await client.callTool({
      name: 'search_knowledge_base',
      arguments: { query: 'SHBG testosterone', k: 2 },
    });
    const payload = JSON.parse(firstText(res)) as Record<string, unknown>;
    expect(payload.available).toBe(true);
    expect((payload.results as unknown[]).length).toBeGreaterThan(0);
    // Disclaimer is still present (GOLD §2.5)
    expect(payload.disclaimer).toBeTruthy();
  });

  it('calls get_rag_status (graph gracefully unavailable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('down'))),
    );
    const res = await client.callTool({ name: 'get_rag_status', arguments: {} });
    const payload = JSON.parse(firstText(res)) as Record<string, unknown>;
    expect((payload.deterministicKB as { available: boolean }).available).toBe(true);
    expect((payload.knowledgeGraph as { available: boolean }).available).toBe(false);
    vi.unstubAllGlobals();
  });

  it('lists and reads resources (platform docs + kb catalog)', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain('trt://platform/gold');
    expect(uris).toContain('trt://kb/documents');

    const gold = await client.readResource({ uri: 'trt://platform/gold' });
    const text = (gold.contents[0] as { text: string }).text;
    expect(text.length).toBeGreaterThan(200);

    const docs = await client.readResource({ uri: 'trt://kb/documents' });
    const catalog = JSON.parse((docs.contents[0] as { text: string }).text) as {
      documentCount: number;
    };
    expect(catalog.documentCount).toBe(1);
  });

  it('reads a doc via the trt://platform/docs/{name} template', async () => {
    const res = await client.readResource({ uri: 'trt://platform/docs/rag' });
    const text = (res.contents[0] as { text: string }).text;
    expect(text).toContain('RAG');
  });

  it('gets the trt_knowledge_query prompt with the disclaimer', async () => {
    const res = await client.getPrompt({
      name: 'trt_knowledge_query',
      arguments: { question: 'What covers hematocrit?' },
    });
    expect(res.messages.length).toBe(1);
    const text = (res.messages[0]!.content as { text: string }).text;
    expect(text).toContain('What covers hematocrit?');
    expect(text).toContain('qualified healthcare professional');
  });

  it('rejects invalid tool input (schema validation)', async () => {
    // MCP semantics: invalid input comes back as an error RESULT, not a throw.
    const res = await client.callTool({ name: 'search_knowledge_base', arguments: { query: 'x' } });
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect(firstText(res)).toContain('too_small');
  });
});
