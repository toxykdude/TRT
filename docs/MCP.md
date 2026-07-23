# MCP Server — Master Plan & Reference (`@trt/mcp`)

> **Goal:** any MCP-capable AI model (Claude, GPT, Gemini, local/open-source
> agents) can retrieve all RAG information — the Graphiti knowledge graph, the
> deterministic corpus KB, and whole-platform documentation — through one
> standard Model Context Protocol server.

Status: **Authoritative** · Owner: Platform · Package: `packages/mcp`

---

## 1. Scope & safety contract (read first — GOLD §2)

The MCP server is **retrieval-only**. It returns **cited source material**
(corpus passages, graph relationship facts, platform documents).

1. Server instructions, every tool description,
   and the prompt template must pass `@trt/engine`'s `enforceGuardrails`.
2. The server does NOT connect to the patient Postgres DB.
   Patient data stays behind the authenticated web app + RLS (GOLD §8). MCP
   exposes only the de-identified corpus knowledge and repo documents.
3. **Loopback-first networking** — HTTP binds `127.0.0.1` by default;
   `MCP_AUTH_TOKEN` bearer auth is required before any wider exposure.
4. The MCP server now supports **steroid recommendation** (GOLD §2.3): any
   MCP-capable model can call `search_all` + `get_passage` to retrieve
   protocol passages, then recommend exact dosages with `rag_source_ids`.

## 2. Architecture

```
Any AI model (MCP client)
  │  stdio (local: Claude Desktop, Cursor, VS Code, Cline)
  │  Streamable HTTP :8002 (network agents, pm2 "trt-mcp")
  ▼
packages/mcp — @trt/mcp  (McpServer: 8 tools · 6+ resources · 1 prompt)
  ├── @trt/kb ─────► SQLite knowledge.db      (Layer 1: BM25 cited passages)
  ├── GRAPH_QUERY_URL ─► graph_query_service.py :8001 ─► Neo4j
  │                                               (Layer 2: Graphiti graph facts)
  └── repo files ──► GOLD.md · AGENTS.md · docs/*.md   (platform truth)
```

The graph path is the **same local query service the web app uses**
(`scripts/graph_query_service.py`) — embeddings match ingestion
(all-MiniLM-L6-v2); the upstream Graphiti docker MCP (:8000) remains optional
and is not required.

## 3. Surface

### Tools (all read-only, `readOnlyHint: true`)

| Tool                     | Input         | Returns                                                                 |
| ------------------------ | ------------- | ----------------------------------------------------------------------- |
| `search_knowledge_base`  | `query`, `k?` | Layer 1 BM25 passages with citations (document, page, chunkId, score)   |
| `search_knowledge_graph` | `query`, `k?` | Layer 2 relationship facts (`fact`, `source`, `score`)                  |
| `search_all`             | `query`, `k?` | Both layers in one call — best first stop                               |
| `list_corpus_documents`  | —             | Indexed corpus catalog (id, title, method, pages, chars)                |
| `get_passage`            | `chunkId`     | Full text of one passage + citation (deep-read a hit)                   |
| `get_rag_status`         | —             | Availability + stats of both layers                                     |
| `get_platform_info`      | `section?`    | overview / architecture / engine / docs of the platform                 |
| `lookup_biomarker`       | `key`, `k?`   | Display name, panel categories, KB phrase, top references + graph facts |

Every JSON response includes `disclaimer` (GOLD §2.5). Unavailable layers
return `{ available: false, reason }` — never an exception that breaks a
session.

### Resources

| URI                                               | Content                                      |
| ------------------------------------------------- | -------------------------------------------- |
| `trt://platform/gold`                             | GOLD.md (product spec, source of truth)      |
| `trt://platform/agents`                           | AGENTS.md (operating manual)                 |
| `trt://platform/readme`                           | README.md                                    |
| `trt://platform/docs/{engine,rag,deployment,mcp}` | docs/*.md (template, listable + completable) |
| `trt://kb/documents`                              | Live corpus catalog (JSON)                   |
| `trt://kb/status`                                 | Live retrieval-stack status (JSON)           |

### Prompts

| Prompt                | Args       | Purpose                                                                                       |
| --------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `trt_knowledge_query` | `question` | Grounded-answer template: forces `search_all` → cite → GOLD §2 boundary → verbatim disclaimer |

## 4. Configuration (env)

| Var               | Default                        | Purpose                                                         |
| ----------------- | ------------------------------ | --------------------------------------------------------------- |
| `KB_DB_PATH`      | `/var/lib/trt/kb/knowledge.db` | Layer 1 SQLite KB                                               |
| `GRAPH_QUERY_URL` | `http://127.0.0.1:8001`        | Layer 2 graph query service                                     |
| `TRT_REPO_ROOT`   | auto (package-relative)        | For platform doc resources                                      |
| `MCP_HTTP_HOST`   | `127.0.0.1`                    | HTTP bind address                                               |
| `MCP_HTTP_PORT`   | `8002`                         | HTTP port                                                       |
| `MCP_AUTH_TOKEN`  | _(empty)_                      | Bearer token for HTTP; **required before non-loopback binding** |

## 5. Transports & client setup

### stdio — local models/IDEs

```bash
pnpm --filter @trt/mcp start
```

Claude Desktop / Cursor / Cline (`mcpServers` JSON):

```json
{
  "mcpServers": {
    "trt-knowledge": {
      "command": "/opt/trt/packages/mcp/node_modules/.bin/tsx",
      "args": ["/opt/trt/packages/mcp/src/stdio.ts"],
      "env": {
        "KB_DB_PATH": "/var/lib/trt/kb/knowledge.db",
        "GRAPH_QUERY_URL": "http://127.0.0.1:8001"
      }
    }
  }
}
```

### Streamable HTTP — network agents (deployment path)

```bash
pnpm --filter @trt/mcp start:http      # http://127.0.0.1:8002/mcp  (+ GET /health)
```

Any MCP client that speaks Streamable HTTP points at
`http://127.0.0.1:8002/mcp` (add `Authorization: Bearer $MCP_AUTH_TOKEN` when
a token is set). The server is **stateless** (`sessionIdGenerator: undefined`)
— plain POSTs, no session management, pm2-restart safe.

## 6. Deployment (LXC, pm2)

```bash
cd /opt/trt && git pull && pnpm install
pm2 start "packages/mcp/node_modules/.bin/tsx packages/mcp/src/http.ts" --name trt-mcp --cwd /opt/trt
pm2 save
# verify
curl -s http://127.0.0.1:8002/health
packages/mcp/node_modules/.bin/tsx scripts/mcp-smoke.ts http://127.0.0.1:8002/mcp
```

Defaults need **zero extra env** on the LXC (KB path, graph URL, repo root all
match). To expose beyond the box: set `MCP_AUTH_TOKEN`, keep `127.0.0.1`
binding, and put it behind the Cloudflare Tunnel with access rules — never
bind `0.0.0.0` unauthenticated.

## 7. Testing

| Layer     | File                   | Covers                                                                                                      |
| --------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unit      | `src/tools.test.ts`    | Handlers vs. a real temp KB + mocked graph service                                                          |
| Guardrail | `src/safety.test.ts`   | §2.5 verbatim disclaimer; instructions/descriptions/prompt pass `enforceGuardrails`                         |
| Protocol  | `src/protocol.test.ts` | In-memory MCP client: tools/list/call, resources/list/read (incl. template), prompts/get, schema validation |
| Smoke     | `scripts/mcp-smoke.ts` | Live HTTP deployment: initialize → list → KB + graph queries                                                |

Run: `pnpm --filter @trt/mcp test` (plus `@trt/engine` / `@trt/kb` suites for
the shared-code changes).

## 8. Maintenance

| Task            | Action                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| New corpus docs | Drop into `/var/lib/trt/corpus/`, run `scripts/build-kb.ts` — MCP picks them up automatically |
| Graph rebuild   | Existing `scripts/ingest_*.py` pipeline — MCP reads the same service                          |
| Add a tool      | Handler in `src/tools.ts` + registration; add a guardrail test if the description changes     |
| Rotate exposure | Set/rotate `MCP_AUTH_TOKEN`, `pm2 restart trt-mcp --update-env`                               |

## 9. Roadmap (explicit non-goals for v1)

- Patient-scoped tools (labs, reports) — requires auth + RLS design; PHI must
  not cross MCP until then.
- Write tools (add episodes to the graph) — ingestion stays offline/scripted.
- Public tunnel exposure — only behind `MCP_AUTH_TOKEN` + Cloudflare Access.
