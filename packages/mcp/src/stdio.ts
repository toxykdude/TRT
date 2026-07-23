#!/usr/bin/env node
/**
 * stdio transport — for local MCP clients (Claude Desktop, Cursor, VS Code,
 * Cline, any agent that spawns a subprocess server).
 *
 * Run:   pnpm --filter @trt/mcp start
 * Client config example: see docs/MCP.md.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer();
await server.connect(new StdioServerTransport());
// NOTE: stdout is reserved for the MCP protocol — log only to stderr.
console.error('[trt-mcp] stdio server ready');
