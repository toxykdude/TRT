/**
 * @trt/mcp — MCP server exposing the TRT knowledge stack to any MCP-capable
 * AI model. Retrieval-only (GOLD §2): cited source material + platform info,
 * never advice, never PHI.
 *
 * Entrypoints: src/stdio.ts (local clients) and src/http.ts (deployment).
 * This index is the programmatic surface for tests/embedding.
 */
export { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
export { registerTools } from './tools.js';
export { registerResources } from './resources.js';
export { registerPrompts, buildGroundedAnswerPrompt } from './prompts.js';
export { DISCLAIMER, SERVER_INSTRUCTIONS, auditSurface } from './safety.js';
export * from './retrieval.js';
export * from './platform.js';
export * from './tools.js';
export {
  REPO_ROOT,
  KB_DB_PATH,
  GRAPH_QUERY_URL,
  MCP_HTTP_HOST,
  MCP_HTTP_PORT,
  MCP_AUTH_TOKEN,
  kbDatabaseExists,
} from './config.js';
