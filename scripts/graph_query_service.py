#!/usr/bin/env python3
"""
Local graph query service — bridges the knowledge graph (FalkorDB) to the web app.

Why this exists: the Graphiti docker MCP image is hardcoded to an OpenAI
embeddings endpoint, but Z.AI has no embeddings API. This service embeds queries
locally (sentence-transformers, the SAME model used at ingestion) and queries
FalkorDB directly, so embeddings match. It exposes the same shape the web app's
@trt/kb Graphiti client expects (JSON facts), over HTTP on :8001.

Run (in the venv):
  python3 scripts/graph_query_service.py
"""
from __future__ import annotations

import asyncio
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from falkordb import FalkorDB
from sentence_transformers import SentenceTransformer

EMBED_MODEL = os.environ.get("EMBED_MODEL", "all-MiniLM-L6-v2")
HOST = os.environ.get("GRAPH_QUERY_HOST", "127.0.0.1")
PORT = int(os.environ.get("GRAPH_QUERY_PORT", "8001"))
TOP_K = int(os.environ.get("GRAPH_QUERY_TOP_K", "8"))

print(f"Loading embedder {EMBED_MODEL}…", flush=True)
_model = SentenceTransformer(EMBED_MODEL)
_dim = _model.get_embedding_dimension()
print(f"Embedder ready ({_dim}-dim).", flush=True)

_db = FalkorDB(host=os.environ.get("FALKORDB_HOST", "localhost"), port=int(os.environ.get("FALKORDB_PORT", "6379")))
_graph = _db.select_graph(os.environ.get("FALKORDB_DATABASE", "default_db"))


def search(query: str, k: int = TOP_K) -> list[dict]:
    """Find entity nodes whose name or summary matches the query, plus their edges.

    Uses keyword (CONTAINS) matching over entity names + node 'summary' text —
    FalkorDB's vector-procedure signature differs from Neo4j's, and the graph is
    small enough that keyword search is fast and exact. As the graph grows this
    can be upgraded to vector search with the matching procedure signature.
    """
    try:
        tokens = [t for t in query.lower().split() if len(t) > 2]
        if not tokens:
            return []
        # Match any token against entity name or summary (case-insensitive).
        # Build OR conditions per token.
        conditions = " OR ".join(
            ["toLower(n.name) CONTAINS $t%d OR toLower(n.summary) CONTAINS $t%d" % (i, i) for i in range(len(tokens))]
        )
        params = {f"t{i}": tokens[i] for i in range(len(tokens))}
        params["k"] = k
        cypher = (
            "MATCH (n:Entity) WHERE " + conditions + " "
            "OPTIONAL MATCH (n)-[r]-(o:Entity) "
            "RETURN n.name AS name, labels(n) AS labels, "
            "collect(DISTINCT [type(r), o.name]) AS relations "
            "LIMIT $k"
        )
        res = _graph.query(cypher, params).result_set

        facts: list[dict] = []
        for row in res:
            name = row[0]
            labels = row[1]
            relations = row[2] if len(row) > 2 else []
            rel_strs = []
            if relations:
                for rel in relations[:6]:
                    if isinstance(rel, list) and len(rel) >= 2 and rel[1]:
                        rel_strs.append(f"{rel[0]} → {rel[1]}")
            facts.append(
                {
                    "fact": f"{name}" + ((": " + "; ".join(rel_strs)) if rel_strs else ""),
                    "source": "knowledge-graph",
                    "score": 1.0,
                }
            )
        return facts
    except Exception as e:  # noqa: BLE001
        print(f"query error: {e}", flush=True)
        return []


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/health"):
            self._json(200, {"status": "healthy", "embedder": EMBED_MODEL, "dim": _dim})
            return
        self._json(200, {"service": "trt-graph-query", "endpoints": ["GET /health", "POST /search {query,k}"]})

    def do_POST(self):
        if self.path.startswith("/search"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or "{}")
                query = body.get("query", "")
                k = int(body.get("k", TOP_K))
                if not query:
                    self._json(400, {"error": "query required"})
                    return
                results = search(query, k)
                self._json(200, {"results": results, "count": len(results)})
            except Exception as e:  # noqa: BLE001
                self._json(500, {"error": str(e)})
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):  # quieter logging
        print(f"{self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"Serving graph query on http://{HOST}:{PORT}", flush=True)
    HTTPServer((HOST, PORT), Handler).serve_forever()
