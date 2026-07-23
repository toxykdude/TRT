/**
 * Runtime configuration for the TRT MCP server.
 *
 * Everything is env-driven with sensible production defaults matching the LXC
 * layout (docs/DEPLOYMENT.md, docs/RAG.md). No secrets are required for the
 * default localhost-only deployment.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repo root (…/packages/mcp/src → repo root). Overridable for tests. */
export const REPO_ROOT = process.env.TRT_REPO_ROOT ?? resolve(HERE, '../../..');

/** Layer 1 — deterministic KB SQLite database (built by scripts/build-kb.ts). */
export const KB_DB_PATH = process.env.KB_DB_PATH ?? '/var/lib/trt/kb/knowledge.db';

/**
 * Layer 2 — knowledge-graph query endpoint. This is the LOCAL graph query
 * service (scripts/graph_query_service.py, :8001) — the same path the web app
 * uses (packages/kb/src/graphiti.ts). GRAPHITI_MCP_URL is accepted as a
 * fallback alias for parity with @trt/kb.
 */
export const GRAPH_QUERY_URL =
  process.env.GRAPH_QUERY_URL ?? process.env.GRAPHITI_MCP_URL ?? 'http://127.0.0.1:8001';

/** HTTP transport binding. Localhost-only by default (never expose PHI). */
export const MCP_HTTP_HOST = process.env.MCP_HTTP_HOST ?? '127.0.0.1';
export const MCP_HTTP_PORT = Number(process.env.MCP_HTTP_PORT ?? 8002);

/**
 * Optional bearer token for the HTTP transport. Empty = no auth (safe ONLY
 * because the default binding is 127.0.0.1). Set this before binding to a
 * non-loopback address or exposing through a tunnel.
 */
export const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? '';

/** True when the deterministic KB database file exists on disk. */
export function kbDatabaseExists(path: string = KB_DB_PATH): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}
