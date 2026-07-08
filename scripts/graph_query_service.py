#!/usr/bin/env python3
"""
Local graph query service — bridges the Neo4j knowledge graph to the web app.

Embeds queries locally (same all-MiniLM-L6-v2 used at ingestion) and runs a
vector-similarity search over Neo4j entity nodes, returning their typed edges
(relationship facts). Exposes /health and /search over HTTP on :8001.

Run (in the venv):  python3 scripts/graph_query_service.py
Under pm2:          pm2 start .venv/bin/python3 --name trt-graph -- scripts/graph_query_service.py
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from neo4j import GraphDatabase
from sentence_transformers import SentenceTransformer

EMBED_MODEL = os.environ.get("EMBED_MODEL", "all-MiniLM-L6-v2")
HOST = os.environ.get("GRAPH_QUERY_HOST", "127.0.0.1")
PORT = int(os.environ.get("GRAPH_QUERY_PORT", "8001"))
TOP_K = int(os.environ.get("GRAPH_QUERY_TOP_K", "8"))

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PW = os.environ.get("NEO4J_PASSWORD", "trtneo4j2026")

print(f"Loading embedder {EMBED_MODEL}…", flush=True)
_model = SentenceTransformer(EMBED_MODEL)
_dim = _model.get_embedding_dimension()
print(f"Embedder ready ({_dim}-dim).", flush=True)

_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PW))


def search(query: str, k: int = TOP_K) -> list[dict]:
    """Embed the query, find related entity nodes by vector similarity + keyword,
    and return their typed relationship facts."""
    try:
        qvec = [float(x) for x in _model.encode(query, normalize_embeddings=True).tolist()]
        tokens = [t for t in query.lower().split() if len(t) > 2]
        with _driver.session() as s:
            # Try vector similarity first (if the vector index exists)
            results = []
            try:
                rows = s.run(
                    "CALL db.index.vector.queryNodes('entity_embedding', $k, $vec) "
                    "YIELD node, score "
                    "OPTIONAL MATCH (node)-[r]->(o:Entity) "
                    "RETURN node.name AS name, node.type AS type, score, "
                    "collect(DISTINCT [type(r), o.name]) AS rels",
                    {"k": k, "vec": qvec},
                ).data()
                results = rows
            except Exception:
                # No vector index — fall back to keyword CONTAINS (OR over tokens)
                if not tokens:
                    return []
                cond = " OR ".join(
                    f"toLower(n.name) CONTAINS $t{i} OR toLower(n.summary) CONTAINS $t{i}"
                    for i in range(len(tokens))
                )
                params = {f"t{i}": tokens[i] for i in range(len(tokens))}
                params["k"] = k
                rows = s.run(
                    "MATCH (n:Entity) WHERE " + cond + " "
                    "OPTIONAL MATCH (n)-[r]->(o:Entity) "
                    "RETURN n.name AS name, n.type AS type, 1.0 AS score, "
                    "collect(DISTINCT [type(r), o.name]) AS rels LIMIT $k",
                    params,
                ).data()
                results = rows

            facts: list[dict] = []
            for row in results:
                name = row.get("name")
                if not name:
                    continue
                etype = row.get("type", "Entity")
                score = row.get("score", 0.0)
                rels = row.get("rels") or []
                rel_strs = []
                for rel in rels[:8]:
                    if isinstance(rel, list) and len(rel) >= 2 and rel[1]:
                        rel_strs.append(f"{rel[0]} → {rel[1]}")
                fact = f"{name} ({etype})"
                if rel_strs:
                    fact += ": " + "; ".join(rel_strs)
                facts.append({"fact": fact, "source": "knowledge-graph", "score": round(float(score), 4)})
            return facts
    except Exception as e:
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
            self._json(200, {"status": "healthy", "embedder": EMBED_MODEL, "dim": _dim, "backend": "neo4j"})
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
            except Exception as e:
                self._json(500, {"error": str(e)})
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"Serving graph query on http://{HOST}:{PORT} (Neo4j @ {NEO4J_URI})", flush=True)
    HTTPServer((HOST, PORT), Handler).serve_forever()
