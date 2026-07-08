#!/usr/bin/env python3
"""
Direct corpus → Neo4j knowledge-graph ingestion.

Builds the knowledge graph WITHOUT Graphiti's add_episode orchestrator, which
deadlocks (upstream bug in graphiti-core 0.29.2). Instead this calls Z.AI
directly for entity/edge extraction and writes to Neo4j itself. The result is
the same kind of graph (entities + typed relationships) that the query service
and web app can use, with no deadlock risk.

PREREQUISITES:
  - /opt/trt-rag/.env with the Z.AI key (run scripts/configure-zai.sh)
  - Neo4j running (docker compose -f docker-compose-neo4j-trt.yml up -d)
  - venv: pip install "openai" "neo4j" "sentence-transformers"
  - Deterministic KB built (pnpm --filter @trt/kb build)

USAGE:
  python3 scripts/ingest_direct.py
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

KB_TEXT_DIR = Path(os.environ.get("KB_TEXT_DIR", "/var/lib/trt/kb/text"))
ENV_FILE = Path(os.environ.get("GRAPHITI_ENV", "/opt/trt-rag/.env"))
MANIFEST = Path(os.environ.get("KB_INGEST_MANIFEST", "/var/lib/trt/kb/neo4j_ingested.json"))
EMBED_MODEL = os.environ.get("EMBED_MODEL", "all-MiniLM-L6-v2")
CHUNK_CHARS = 6000  # keep prompts well under Z.AI's context limit

EXTRACT_PROMPT = """You are a medical knowledge extractor. Read the passage and extract entities and their relationships as JSON.

Passage:
\"\"\"
{passage}
\"\"\"

Extract:
- entities: objects with {{name, type}} where type is one of: Drug, Hormone, Biomarker, Condition, Procedure, Organization, Guideline, Receptor, Metabolite, Symptom, BodySystem
- edges: objects with {{source, target, relation}} where relation is one of: TREATS, CAUSES, INDICATES, INTERACTS_WITH, METABOLIZES_INTO, BINDS_TO, INHIBITS, ELEVATES, LOWERS, ASSOCIATED_WITH, CONTRAINDICATED_WITH

Only extract entities/edges explicitly supported by the passage. Do NOT invent medical facts.

Respond with ONLY this JSON shape (no prose, no code fence):
{{"entities": [{{"name": "...", "type": "..."}}], "edges": [{{"source": "...", "target": "...", "relation": "..."}}]}}"""


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"'))


def load_manifest() -> dict[str, str]:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {}


def save_manifest(m: dict[str, str]) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2, sort_keys=True))


def passages(text: str) -> list[str]:
    text = text.strip()
    if len(text) <= CHUNK_CHARS:
        return [text] if text else []
    out = []
    for i in range(0, len(text), CHUNK_CHARS):
        chunk = text[i : i + CHUNK_CHARS].strip()
        if i + CHUNK_CHARS < len(text):
            br = chunk.rfind("\n\n")
            if br > CHUNK_CHARS // 2:
                chunk = chunk[:br].strip()
        if chunk and len(chunk) > 200:
            out.append(chunk)
    return out


def strip_fence(s: str) -> str:
    m = re.search(r"\{.*\}", s, re.DOTALL)
    return m.group(0) if m else s


def main() -> int:
    load_env_file(ENV_FILE)
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key or api_key == "PASTE_KEY_HERE":
        print("No Z.AI key. Run: bash /opt/trt-rag/set-key.sh", file=sys.stderr)
        return 2
    base_url = os.environ.get("OPENAI_API_URL", "https://api.z.ai/api/coding/paas/v4").rstrip("/")
    model = os.environ.get("MODEL_NAME", "glm-4.5-air")
    neo4j_uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
    neo4j_pw = os.environ.get("NEO4J_PASSWORD", "trtneo4j2026")

    if not KB_TEXT_DIR.exists():
        print(f"No extracted text at {KB_TEXT_DIR}. Run: pnpm --filter @trt/kb build", file=sys.stderr)
        return 2

    from openai import OpenAI
    from neo4j import GraphDatabase
    from sentence_transformers import SentenceTransformer
    import httpx

    print(f"LLM: {model} @ {base_url}")
    print(f"Embedder: {EMBED_MODEL} (local)")
    print(f"Graph: Neo4j @ {neo4j_uri}")

    # GLM reasoning models are SLOW (~160s/passage for extraction). The default
    # openai client timeout kills the call before reasoning finishes. Use an
    # explicit long read timeout.
    llm = OpenAI(
        api_key=api_key,
        base_url=base_url,
        http_client=httpx.Client(timeout=httpx.Timeout(300.0, connect=15.0)),
    )
    embedder = SentenceTransformer(EMBED_MODEL)
    driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_pw))

    # ensure the graph schema + indexes
    with driver.session() as s:
        s.run("CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (n:Entity) REQUIRE n.name IS UNIQUE")
        try:
            s.run("CREATE VECTOR INDEX entity_embedding IF NOT EXISTS FOR (n:Entity) ON (n.embedding) OPTIONS {indexConfig: {`vector.dimensions`: 384, `vector.similarity_function`: \"cosine\"}}")
        except Exception:
            pass  # already exists or version differs

    text_files = sorted(KB_TEXT_DIR.glob("*.txt"))
    manifest = load_manifest()
    pending = [f for f in text_files if manifest.get(f.name) != str(f.stat().st_size)]
    print(f"Source texts: {len(text_files)} total, {len(pending)} pending.")
    if not pending:
        print("Up to date. Nothing to ingest.")
        return 0

    docs_done = 0
    for tf in pending:
        title = tf.stem
        text = tf.read_text(encoding="utf-8", errors="replace")
        chunks = passages(text)
        if not chunks:
            print(f"  . {title}: no usable text, skipping")
            continue

        doc_entities = 0
        doc_edges = 0
        for idx, chunk in enumerate(chunks):
            try:
                resp = llm.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": "You extract medical knowledge as JSON. Respond with ONLY JSON, no prose."},
                        {"role": "user", "content": EXTRACT_PROMPT.format(passage=chunk[:5000])},
                    ],
                    response_format={"type": "json_object"},
                    max_tokens=8000,
                )
                content = resp.choices[0].message.content or "{}"
                data = json.loads(strip_fence(content))
                entities = data.get("entities", [])
                edges = data.get("edges", [])

                with driver.session() as s:
                    # upsert entities with embeddings
                    for ent in entities:
                        name = str(ent.get("name", "")).strip()
                        etype = str(ent.get("type", "Entity")).strip()
                        if not name:
                            continue
                        emb = [float(x) for x in embedder.encode(name, normalize_embeddings=True).tolist()]
                        s.run(
                            "MERGE (n:Entity {name: $name}) "
                            "ON CREATE SET n.type = $type, n.source_doc = $doc "
                            "SET n.embedding = $emb",
                            {"name": name, "type": etype, "doc": title, "emb": emb},
                        )
                        doc_entities += 1
                    # upsert edges
                    for edge in edges:
                        src = str(edge.get("source", "")).strip()
                        tgt = str(edge.get("target", "")).strip()
                        rel = str(edge.get("relation", "ASSOCIATED_WITH")).strip().upper()
                        rel = rel if rel.isidentifier() else "ASSOCIATED_WITH"
                        if not src or not tgt:
                            continue
                        s.run(
                            "MATCH (a:Entity {name: $src}), (b:Entity {name: $tgt}) "
                            "MERGE (a)-[r:%s]->(b) SET r.source_doc = $doc" % rel,
                            {"src": src, "tgt": tgt, "doc": title},
                        )
                        doc_edges += 1
            except Exception as e:
                print(f"  ~ {title} part {idx+1}/{len(chunks)} skipped: {str(e)[:100]}", file=sys.stderr)

        manifest[tf.name] = str(tf.stat().st_size)
        save_manifest(manifest)
        docs_done += 1
        print(f"  + {title} ({len(chunks)} passage{'s' if len(chunks)!=1 else ''}): {doc_entities} entities, {doc_edges} edges")

    with driver.session() as s:
        n = s.run("MATCH (n) RETURN count(n) AS c").single()["c"]
        e = s.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]
    driver.close()
    print(f"\n+ Ingested {docs_done} document(s). Graph now has {n} nodes, {e} edges.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
