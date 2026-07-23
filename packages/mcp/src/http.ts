#!/usr/bin/env node
/**
 * HTTP transport (Streamable HTTP, stateless) — the deployment path.
 *
 *   POST /mcp     — MCP protocol endpoint (JSON-RPC; any MCP client)
 *   GET  /health  — liveness + retrieval-stack status (no auth; localhost-only)
 *
 * Stateless mode (sessionIdGenerator: undefined): every POST gets a fresh
 * server+transport pair, so there are no sessions to leak or expire and pm2
 * restarts are seamless. Binds 127.0.0.1:8002 by default; set MCP_AUTH_TOKEN
 * before exposing beyond localhost.
 */
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { MCP_AUTH_TOKEN, MCP_HTTP_HOST, MCP_HTTP_PORT } from './config.js';
import { createServer } from './server.js';
import { kbStatus, graphStatus } from './retrieval.js';

function json(res: ServerResponse, code: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function authorized(req: IncomingMessage): boolean {
  if (!MCP_AUTH_TOKEN) return true; // localhost-only default
  const header = req.headers.authorization ?? '';
  return header === `Bearer ${MCP_AUTH_TOKEN}`;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

const http = createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/health' && req.method === 'GET') {
    const kb = kbStatus();
    const graph = await graphStatus();
    json(res, 200, {
      status: 'healthy',
      server: 'trt-mcp',
      deterministicKB: kb.available
        ? { available: true, documents: kb.documents, passages: kb.passages }
        : kb,
      knowledgeGraph: graph,
    });
    return;
  }

  if (url.pathname === '/mcp') {
    if (!authorized(req)) {
      json(res, 401, { error: 'unauthorized: Bearer token required (MCP_AUTH_TOKEN)' });
      return;
    }
    if (req.method !== 'POST') {
      // Stateless transport: GET/DELETE (SSE streams / session teardown) are N/A.
      json(res, 405, { error: 'method_not_allowed: stateless server accepts POST only' });
      return;
    }
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      json(res, 400, { error: 'invalid JSON body' });
      return;
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createServer();
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  json(res, 404, { error: 'not_found', endpoints: ['POST /mcp', 'GET /health'] });
});

http.listen(MCP_HTTP_PORT, MCP_HTTP_HOST, () => {
  console.error(
    `[trt-mcp] HTTP MCP listening on http://${MCP_HTTP_HOST}:${MCP_HTTP_PORT}/mcp ` +
      `(${MCP_AUTH_TOKEN ? 'bearer auth' : 'no auth — loopback only'})`,
  );
});
