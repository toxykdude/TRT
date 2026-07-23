/**
 * MCP resources — readable documents & live status over trt:// URIs.
 *
 *   trt://platform/gold|agents|readme   — top-level platform documents
 *   trt://platform/docs/{name}          — docs/{engine,rag,deployment,mcp}.md
 *   trt://kb/documents                  — corpus catalog (JSON, live from SQLite)
 *   trt://kb/status                     — retrieval-stack status (JSON, live)
 *
 * Read-only; contents are public-repo documents and aggregate KB metadata —
 * never patient data.
 */
import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { kbDocuments, kbStatus, graphStatus } from './retrieval.js';
import { readPlatformDoc, type PlatformDocKey } from './platform.js';
import { KB_DB_PATH, GRAPH_QUERY_URL } from './config.js';
import { DISCLAIMER } from './safety.js';

async function docContents(key: PlatformDocKey, uri: URL) {
  const text = await readPlatformDoc(key);
  if (text === null) {
    throw new Error(`Document not found: ${key} (looked in repo root; see docs/MCP.md)`);
  }
  return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
}

const DOC_TEMPLATE_VARIABLES = ['engine', 'rag', 'deployment', 'mcp'] as const;

/** Register all resources on the server. */
export function registerResources(server: McpServer): void {
  // ── Top-level platform documents ───────────────────────────────────────────
  server.registerResource(
    'gold',
    'trt://platform/gold',
    {
      title: 'GOLD.md — product spec & clinical safety boundary',
      description: 'The single source of truth for the platform (scope, safety, requirements).',
      mimeType: 'text/markdown',
    },
    (uri) => docContents('gold', uri),
  );

  server.registerResource(
    'agents',
    'trt://platform/agents',
    {
      title: 'AGENTS.md — operating manual',
      description: 'Setup, conventions, and the analysis/AI behavioral contract.',
      mimeType: 'text/markdown',
    },
    (uri) => docContents('agents', uri),
  );

  server.registerResource(
    'readme',
    'trt://platform/readme',
    {
      title: 'README.md — overview',
      description: 'Public-facing introduction and document index.',
      mimeType: 'text/markdown',
    },
    (uri) => docContents('readme', uri),
  );

  // ── docs/* via template ────────────────────────────────────────────────────
  server.registerResource(
    'platform-doc',
    new ResourceTemplate('trt://platform/docs/{name}', {
      list: async () => ({
        resources: DOC_TEMPLATE_VARIABLES.map((name) => ({
          uri: `trt://platform/docs/${name}`,
          name: `docs/${name}.md`,
          mimeType: 'text/markdown',
        })),
      }),
      complete: {
        name: (value) => DOC_TEMPLATE_VARIABLES.filter((n) => n.startsWith(value)),
      },
    }),
    {
      title: 'Platform docs (engine, rag, deployment, mcp)',
      description: 'Architecture and operations documents from the repo docs/ directory.',
      mimeType: 'text/markdown',
    },
    (uri, variables) => {
      const name = String(variables.name ?? '');
      if (!(DOC_TEMPLATE_VARIABLES as readonly string[]).includes(name)) {
        throw new Error(`Unknown doc '${name}'. Available: ${DOC_TEMPLATE_VARIABLES.join(', ')}`);
      }
      return docContents(`docs/${name}` as PlatformDocKey, uri);
    },
  );

  // ── Live KB catalog & status (JSON) ────────────────────────────────────────
  server.registerResource(
    'kb-documents',
    'trt://kb/documents',
    {
      title: 'Corpus document catalog (JSON)',
      description: 'Every source document indexed in the deterministic knowledge base.',
      mimeType: 'application/json',
    },
    (uri) => {
      const status = kbStatus();
      const docs = status.available ? kbDocuments() : [];
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                available: status.available,
                ...(status.available
                  ? { documentCount: docs.length, passageCount: status.passages }
                  : { reason: status.reason }),
                documents: docs.map((d) => ({
                  id: d.id,
                  title: d.title,
                  method: d.method,
                  pages: d.pages,
                  charCount: d.charCount,
                })),
                disclaimer: DISCLAIMER,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerResource(
    'kb-status',
    'trt://kb/status',
    {
      title: 'Retrieval-stack status (JSON)',
      description: 'Availability of the deterministic KB and the knowledge-graph service.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const kb = kbStatus();
      const graph = await graphStatus();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                deterministicKB: kb.available
                  ? {
                      available: true,
                      dbPath: KB_DB_PATH,
                      documents: kb.documents,
                      passages: kb.passages,
                    }
                  : { available: false, dbPath: KB_DB_PATH, reason: kb.reason },
                knowledgeGraph: graph.available
                  ? {
                      available: true,
                      url: GRAPH_QUERY_URL,
                      backend: graph.backend,
                      embedder: graph.embedder,
                    }
                  : { available: false, url: GRAPH_QUERY_URL, reason: graph.reason },
                disclaimer: DISCLAIMER,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
