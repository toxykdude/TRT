# Knowledge Base & RAG Architecture

Two complementary knowledge layers power the system's clinical context. **Layer 1
is fully deterministic** (no model) and runs always; **Layer 2 is a Graphiti
knowledge graph** that is built once (using an LLM) and then queried
deterministically, and which an AI model can hook into via MCP for enhanced
answers.

```
                              ┌─────────────────────────────────────┐
   lab results + patient ───▶ │  Deterministic engine (@trt/engine) │
                              │  classify → trends → rules → report │
                              └───────────────┬─────────────────────┘
                                              │ enrichWithKnowledge()
                ┌─────────────────────────────┼─────────────────────────────┐
                ▼                                                           ▼
   ┌─────────────────────────────┐                    ┌──────────────────────────────────┐
   │ LAYER 1 — deterministic KB  │                    │ LAYER 2 — Graphiti graph (MCP)   │
   │ @trt/kb (SQLite + TF-IDF)   │                    │ FalkorDB + Graphiti MCP :8000    │
   │ always on, no model         │                    │ built once, queried determinist. │
   │ cited passages (BM25)       │                    │ relationship facts               │
   └─────────────────────────────┘                    └──────────────────────────────────┘
```

---

## Layer 1 — Deterministic Knowledge Base (always on, no model)

The primary, always-available knowledge source. **Zero AI model dependency** —
pure TF-IDF/BM25 retrieval over the extracted corpus, fully reproducible.

### What it is
- SQLite database of text chunks (~1,000 chars each) extracted from the corpus
  (PDFs, EPUBs, images via `pdftotext` / OCR / epub-unzip).
- Each chunk carries its source document title + page, so every retrieved
  passage is a **citation**, not a generated claim.
- Ranking: **BM25** (inverse-document-frequency weighted term matching) with
  per-chunk term-frequency tables. Same query → same ranked passages, always.

### Where it lives
| Artifact | Path |
|---|---|
| Source corpus | `/var/lib/trt/corpus/` (gitignored; local-only data) |
| Extracted text | `/var/lib/trt/kb/text/*.txt` |
| KB database | `/var/lib/trt/kb/knowledge.db` (~60MB for 57 docs) |
| Code | `packages/kb/` (`store.ts` = SQLite + BM25, `extract.ts` = corpus parsing) |
| Build script | `scripts/build-kb.ts` |

### Build / rebuild the KB
```bash
# On the LXC (root):
cd /opt/trt
export CORPUS_DIR=/var/lib/trt/corpus KB_DB_PATH=/var/lib/trt/kb/knowledge.db KB_TEXT_DIR=/var/lib/trt/kb/text
TSX=node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs   # resolve via: find node_modules/.pnpm -path "*tsx/dist/cli.mjs"
node "$TSX" scripts/build-kb.ts
```
Idempotent — already-indexed sources (same path + content hash) are skipped. Add
a new document to the corpus dir and re-run; only the new doc is indexed.

### How the engine uses it
- `analyze(input, kbSearch)` — the web route injects `searchReferences` from
  `@trt/kb`.
- For each finding's biomarker, the engine queries the KB and attaches up to 2
  cited passages as `finding.references[]`.
- These aggregate into the report's **"References from the knowledge base"**
  section, with source title + excerpt.
- **Determinism preserved**: references fold into the report's sha256 hash, so
  the same labs + KB always produce the same report (verified in golden tests).

### Verified
- 57 documents indexed, 8,382 chunks.
- Query "hematocrit polycythemia" → cited passage from *Anabolics 11th ed.* about
  pro-thrombotic changes. Query "SHBG" → free/bound testosterone passage.

---

## Layer 2 — Graphiti Knowledge Graph (MCP, builds with an LLM)

An optional enhancement: a relationship-aware knowledge graph that an AI model
can hook into via MCP. **Built once using an LLM, then frozen** — at query time
only embeddings + graph traversal run (no generative LLM), so runtime stays
deterministic.

### Why two layers
Graphiti requires an LLM during *ingestion* (entity/edge extraction). Layer 1
exists so the system has comprehensive, deterministic answers **without** that
dependency. Layer 2 adds relationship reasoning (e.g. "drug X interacts with
biomarker Y") that flat text search can't, and gives an AI assistant a rich MCP
context to enhance answers.

### Stack (running on the LXC)
| Service | Port | Purpose |
|---|---|---|
| FalkorDB | 6379 | Graph DB (Redis-based; chosen over Neo4j for the 2GB box) |
| **Graph query service** | **8001** | **Local Python service** (sentence-transformers + FalkorDB) — the web app's query path |
| Graphiti MCP | 8000 | Graphiti MCP server (available; the local query service is the primary path) |

> The **local query service** (`scripts/graph_query_service.py`) is the path the
> web app uses, NOT the docker MCP. Reason: the MCP image is hardcoded to an
> OpenAI embeddings endpoint, but Z.AI (the LLM provider) has no embeddings API.
> The local service embeds queries with the **same** all-MiniLM-L6-v2 model used
> at ingestion, so embeddings match. It runs under pm2 as `trt-graph`.

> Neo4j was the original choice but its own capped config exceeds the box's RAM;
> FalkorDB (Graphiti's default) is the in-use backend. Backend is pluggable.

### Build the graph (needs an LLM key — the one model-dependent step)
The graph is built with **Z.AI** (GLM-4.5-air, OpenAI-compatible) as the LLM and
**local sentence-transformers** (all-MiniLM-L6-v2) for embeddings. This pairing
is required because Z.AI's global API has no embeddings endpoint; the embedder
runs locally so embeddings stay consistent between ingestion and query.

```bash
# 1. Set the Z.AI key (one-time)
bash /opt/trt-rag/set-key.sh   # pastes masked → /opt/trt-rag/.env

# 2. Install the Python env (one-time)
cd /opt/trt && python3 -m venv .venv && . .venv/bin/activate
pip install "graphiti-core[falkordb,sentence-transformers]"

# 3. Ingest the medical corpus (reads Layer 1's extracted text, builds the graph)
python3 scripts/ingest_corpus.py
#   - large docs are auto-chunked into ~8K-char passages
#   - idempotent (manifest at /var/lib/trt/kb/graphiti_ingested.json)
#   - resumable; re-run after interruption to continue

# 4. The graph query service runs under pm2 (name: trt-graph, port 8001)
pm2 list   # confirm trt-graph online
```

> **Cost/time reality**: Graphiti makes several LLM calls per passage (entity
> extraction, edges, dedup, summarization). The Anabolics book alone is ~440
> passages. Full ingestion of the medical corpus is a multi-hour job. It runs
> unattended in the background and is fully resumable.

After ingestion, the graph is a **frozen knowledge base** — queries use the local
embedder + FalkorDB (no LLM at query time), so runtime stays deterministic.

### MCP tools exposed
`add_episode`, `search_nodes`, `search_facts`, `get_episodes`, `get_entity_edge`,
`delete_entity_edge`, `delete_episode`, `clear_graph`, `get_status`.

### How the app uses it
- `@trt/kb`'s `searchGraphFacts(query)` calls the MCP `search_facts` tool over
  HTTP at `GRAPHITI_MCP_URL` (set in `.env`).
- **Graceful fallback**: if the graph is empty/unbuilt or the MCP is down, it
  returns `[]` with a status note — Layer 1 always carries the report.
- An AI assistant surface (roadmap) can consume the same MCP to answer
  TRT-treatment questions with full graph context, while Layer 1 guarantees a
  deterministic baseline.

---

## Determinism contract (GOLD §2 / Goal 1)

- Layer 1 search is pure BM25 — same query → same passages.
- The engine folds references into the report hash.
- Layer 2's query path is embeddings + graph traversal (no generation).
- An LLM appears **only** in Layer 2 *ingestion* (build once) and any optional
  AI-assistant surface — never in the deterministic report path.

## Maintenance
| Task | Command |
|---|---|
| Add corpus docs | drop into `/var/lib/trt/corpus/`, run `build-kb.ts` |
| Rebuild KB from scratch | `rm /var/lib/trt/kb/knowledge.db*` then `build-kb.ts` |
| Rebuild graph | set LLM key, `python3 scripts/ingest_corpus.py` |
| Stack status | `docker compose -f /opt/trt-rag/graphiti/mcp_server/docker/docker-compose-falkordb-safe.yml ps` |
| MCP health | `curl http://127.0.0.1:8000/health` |
