#!/usr/bin/env python3
"""
Sharded corpus → Neo4j ingestion worker.

Same extraction logic as ingest_direct.py, but each worker processes only its
shard of the corpus: files where hash(filename) % SHARD_COUNT == SHARD_INDEX.
Run multiple workers in parallel to speed up the build.

USAGE:
  python3 scripts/ingest_shard.py <shard_index> <shard_count>
  e.g. python3 scripts/ingest_shard.py 0 4   # worker 0 of 4
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path

KB_TEXT_DIR = Path(os.environ.get("KB_TEXT_DIR", "/var/lib/trt/kb/text-medical"))
ENV_FILE = Path(os.environ.get("GRAPHITI_ENV", "/opt/trt-rag/.env"))
EMBED_MODEL = os.environ.get("EMBED_MODEL", "all-MiniLM-L6-v2")
CHUNK_CHARS = 6000

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


def shard_of(filename: str, count: int) -> int:
    return int(hashlib.md5(filename.encode()).hexdigest(), 16) % count


def strip_fence(s: str) -> str:
    m = re.search(r"\{.*\}", s, re.DOTALL)
    return m.group(0) if m else s


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


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: ingest_shard.py <shard_index> <shard_count>", file=sys.stderr)
        return 2
    shard_index = int(sys.argv[1])
    shard_count = int(sys.argv[2])

    load_env_file(ENV_FILE)
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key or api_key == "PASTE_KEY_HERE":
        print("No Z.AI key.", file=sys.stderr)
        return 2
    base_url = os.environ.get("OPENAI_API_URL", "https://api.z.ai/api/coding/paas/v4").rstrip("/")
    model = os.environ.get("MODEL_NAME", "glm-4.5-air")

    # per-shard manifest to avoid contention between workers
    MANIFEST = Path(os.environ.get("KB_INGEST_MANIFEST", f"/var/lib/trt/kb/neo4j_ingested.shard{shard_index}.json"))

    def load_manifest() -> dict[str, str]:
        if MANIFEST.exists():
            return json.loads(MANIFEST.read_text())
        return {}

    def save_manifest(m: dict[str, str]) -> None:
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(json.dumps(m, indent=2, sort_keys=True))

    from openai import OpenAI
    from neo4j import GraphDatabase
    from sentence_transformers import SentenceTransformer
    import httpx

    print(f"[shard {shard_index}/{shard_count}] LLM: {model} @ {base_url}", flush=True)
    llm = OpenAI(api_key=api_key, base_url=base_url, http_client=httpx.Client(timeout=httpx.Timeout(300.0, connect=15.0)))
    embedder = SentenceTransformer(EMBED_MODEL)
    driver = GraphDatabase.driver(os.environ.get("NEO4J_URI", "bolt://localhost:7687"), auth=(os.environ.get("NEO4J_USER", "neo4j"), os.environ.get("NEO4J_PASSWORD", "trtneo4j2026")))

    # shard-aware index/constraint creation (idempotent)
    with driver.session() as s:
        s.run("CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (n:Entity) REQUIRE n.name IS UNIQUE")
        try:
            s.run("CREATE VECTOR INDEX entity_embedding IF NOT EXISTS FOR (n:Entity) ON (n.embedding) OPTIONS {indexConfig: {`vector.dimensions`: 384, `vector.similarity_function`: \"cosine\"}}")
        except Exception:
            pass

    all_files = sorted(KB_TEXT_DIR.glob("*.txt"))
    my_files = [f for f in all_files if shard_of(f.name, shard_count) == shard_index]
    manifest = load_manifest()
    pending = [f for f in my_files if manifest.get(f.name) != str(f.stat().st_size)]
    print(f"[shard {shard_index}] my files: {len(my_files)}, pending: {len(pending)}", flush=True)
    if not pending:
        print(f"[shard {shard_index}] up to date.", flush=True)
        driver.close()
        return 0

    docs_done = 0
    for tf in pending:
        title = tf.stem
        text = tf.read_text(encoding="utf-8", errors="replace")
        chunks = passages(text)
        if not chunks:
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
                    for ent in entities:
                        name = str(ent.get("name", "")).strip()
                        etype = str(ent.get("type", "Entity")).strip()
                        if not name:
                            continue
                        emb = [float(x) for x in embedder.encode(name, normalize_embeddings=True).tolist()]
                        s.run("MERGE (n:Entity {name: $name}) ON CREATE SET n.type=$type, n.source_doc=$doc SET n.embedding=$emb", {"name": name, "type": etype, "doc": title, "emb": emb})
                        doc_entities += 1
                    for edge in edges:
                        src = str(edge.get("source", "")).strip()
                        tgt = str(edge.get("target", "")).strip()
                        rel = str(edge.get("relation", "ASSOCIATED_WITH")).strip().upper()
                        rel = rel if rel.replace("_", "").isalnum() else "ASSOCIATED_WITH"
                        if not src or not tgt:
                            continue
                        s.run("MATCH (a:Entity {name:$src}), (b:Entity {name:$tgt}) MERGE (a)-[r:%s]->(b) SET r.source_doc=$doc" % rel, {"src": src, "tgt": tgt, "doc": title})
                        doc_edges += 1
            except Exception as e:
                print(f"[shard {shard_index}] ~ {title} part {idx+1}/{len(chunks)} skipped: {str(e)[:80]}", flush=True)
        manifest[tf.name] = str(tf.stat().st_size)
        save_manifest(manifest)
        docs_done += 1
        print(f"[shard {shard_index}] + {title} ({len(chunks)} passages): {doc_entities} entities, {doc_edges} edges", flush=True)

    driver.close()
    print(f"[shard {shard_index}] done: {docs_done} doc(s).", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
