/**
 * Build the TRT MCP server: tools + resources + prompts, with the GOLD §2
 * server instructions attached. Transport-agnostic — stdio.ts and http.ts
 * attach the actual transports.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SERVER_INSTRUCTIONS } from './safety.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';

export const SERVER_NAME = 'trt-knowledge';
export const SERVER_VERSION = '0.1.0';

export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { tools: {}, resources: {}, prompts: {} },
    },
  );
  registerTools(server);
  registerResources(server);
  registerPrompts(server);
  return server;
}
