/**
 * Tool handler tests — run against a real (temporary) KB built with KbStore,
 * plus a mocked graph query service. No transport involved.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Env must be set BEFORE importing the modules under test (config is read at import).
const tmp = mkdtempSync(join(tmpdir(), 'trt-mcp-tools-'));
process.env.KB_DB_PATH = join(tmp, 'knowledge.db');
process.env.GRAPH_QUERY_URL = 'http://127.0.0.1:9'; // unreachable by default

type Tools = typeof import('./tools.js');
let tools: Tools;

function payloadOf(res: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

function stubGraphDown() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))),
  );
}

beforeAll(async () => {
  const { KbStore } = await import('@trt/kb');
  const store = new KbStore(process.env.KB_DB_PATH!);
  store.indexDocument({
    title: 'Clinical Hematology Review',
    sourcePath: '/corpus/hematology.pdf',
    contentHash: 'hash-a',
    method: 'pdftotext',
    pages: 12,
    text:
      'Hematocrit is the volume percentage of red blood cells in whole blood. ' +
      'Values above the laboratory reference range are described as elevated and ' +
      'warrant prompt medical review.\n\n' +
      'Testosterone therapy is known to raise hematocrit in some patients, so ' +
      'clinical guidelines recommend periodic monitoring during follow-up.',
  });
  store.indexDocument({
    title: 'Endocrine Notes',
    sourcePath: '/corpus/endocrine.epub',
    contentHash: 'hash-b',
    method: 'epub-unzip',
    pages: null,
    text:
      'Estradiol is produced in part by aromatization of testosterone in peripheral ' +
      'tissue. Sex hormone binding globulin binds circulating sex steroids and lowers ' +
      'the free fractions.\n\n' +
      'Symptoms alone should never be used to judge hormone status; laboratory ' +
      'confirmation and clinician review are required.',
  });
  store.close();
  tools = await import('./tools.js');
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('search_knowledge_base', () => {
  it('returns cited passages with the disclaimer', async () => {
    const res = await tools.handleSearchKnowledgeBase({ query: 'hematocrit monitoring', k: 3 });
    const p = payloadOf(res);
    expect(p.available).toBe(true);
    expect(p.count).toBeGreaterThan(0);
    const first = (p.results as Array<Record<string, unknown>>)[0]!;
    expect(first.document).toBe('Clinical Hematology Review');
    expect(typeof first.chunkId).toBe('number');
    expect(typeof first.passage).toBe('string');
    expect(p.disclaimer).toMatch(/^This software provides educational/);
  });

  it('returns zero results (not an error) for unmatched queries', async () => {
    const res = await tools.handleSearchKnowledgeBase({ query: 'zzzqqq nonexistentterm', k: 3 });
    const p = payloadOf(res);
    expect(p.available).toBe(true);
    expect(p.count).toBe(0);
  });
});

describe('search_knowledge_graph (mocked service)', () => {
  it('returns facts when the graph service responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/health')) {
          return new Response(
            JSON.stringify({ status: 'healthy', backend: 'neo4j', embedder: 'all-MiniLM-L6-v2' }),
          );
        }
        return new Response(
          JSON.stringify({
            results: [
              {
                fact: 'Aromatizing steroids (Drug): ELEVATES → blood pressure',
                source: 'knowledge-graph',
                score: 0.88,
              },
            ],
          }),
        );
      }),
    );
    const res = await tools.handleSearchKnowledgeGraph({ query: 'testosterone estradiol', k: 3 });
    const p = payloadOf(res);
    expect(p.available).toBe(true);
    expect((p.results as unknown[]).length).toBe(1);
    expect(p.disclaimer).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('reports unavailable (graceful) when the service is down', async () => {
    stubGraphDown();
    const res = await tools.handleSearchKnowledgeGraph({ query: 'anything', k: 3 });
    const p = payloadOf(res);
    expect(p.available).toBe(false);
    expect(p.reason).toBe('unreachable');
    expect(p.results).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('search_all', () => {
  it('fans out over both layers', async () => {
    stubGraphDown();
    const res = await tools.handleSearchAll({ query: 'hematocrit', k: 2 });
    const p = payloadOf(res);
    const kb = p.corpusKB as Record<string, unknown>;
    const graph = p.knowledgeGraph as Record<string, unknown>;
    expect(kb.available).toBe(true);
    expect((kb.results as unknown[]).length).toBeGreaterThan(0);
    expect(graph.available).toBe(false);
    expect(graph.results).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('list_corpus_documents / get_passage', () => {
  it('lists the indexed documents', async () => {
    const res = await tools.handleListCorpusDocuments();
    const p = payloadOf(res);
    expect(p.documentCount).toBe(2);
    const titles = (p.documents as Array<{ title: string }>).map((d) => d.title);
    expect(titles).toContain('Clinical Hematology Review');
    expect(titles).toContain('Endocrine Notes');
  });

  it('fetches a passage by chunkId and 404s cleanly on unknown ids', async () => {
    const search = await tools.handleSearchKnowledgeBase({ query: 'hematocrit', k: 1 });
    const chunkId = (payloadOf(search).results as Array<{ chunkId: number }>)[0]!.chunkId;
    const got = await tools.handleGetPassage({ chunkId });
    const p = payloadOf(got);
    expect((p.passage as { chunkId: number }).chunkId).toBe(chunkId);
    expect((p.passage as { document: string }).document).toBe('Clinical Hematology Review');

    const missing = await tools.handleGetPassage({ chunkId: 999999 });
    expect(missing.isError).toBe(true);
  });
});

describe('get_rag_status', () => {
  it('reports KB stats and graph unavailability', async () => {
    stubGraphDown();
    const res = await tools.handleGetRagStatus();
    const p = payloadOf(res);
    const kb = p.deterministicKB as Record<string, unknown>;
    expect(kb.available).toBe(true);
    expect(kb.documents).toBe(2);
    expect(typeof kb.passages).toBe('number');
    const graph = p.knowledgeGraph as Record<string, unknown>;
    expect(graph.available).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('get_platform_info / lookup_biomarker', () => {
  it('returns platform overview with engine summary', async () => {
    const res = await tools.handleGetPlatformInfo({});
    const p = payloadOf(res);
    expect(p.product).toContain('TRT');
    expect(p.docsAvailable).toContain('gold');
  });

  it('resolves biomarker metadata + phrase', async () => {
    stubGraphDown();
    const res = await tools.handleLookupBiomarker({ key: 'hematocrit', k: 2 });
    const p = payloadOf(res);
    expect(p.biomarkerKey).toBe('hematocrit');
    expect(p.known).toBe(true);
    expect(p.panelCategories).toContain('cbc');
    expect(p.kbSearchPhrase).toBe('hematocrit polycythemia blood');
    expect((p.topReferences as unknown[]).length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('handles unknown biomarkers gracefully', async () => {
    stubGraphDown();
    const res = await tools.handleLookupBiomarker({ key: 'not_a_marker', k: 1 });
    const p = payloadOf(res);
    expect(p.known).toBe(false);
    expect(p.disclaimer).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
