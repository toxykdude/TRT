#!/usr/bin/env python3
"""
Ingest the extracted corpus text into the Graphiti knowledge graph.

Build-once step (Goal 2). LLM = Z.AI (OpenAI-compatible); embeddings = local
sentence-transformers (Z.AI's global API has no embeddings endpoint). A small
custom EmbedderClient bridges sentence-transformers into Graphiti.

PREREQUISITES:
  - scripts/configure-zai.sh run, OR /opt/trt-rag/.env contains the Z.AI key
  - venv: pip install "graphiti-core[falkordb,sentence-transformers]"
  - FalkorDB running (docker compose stack)
  - Deterministic KB built (pnpm --filter @trt/kb build)

USAGE:
  python3 scripts/ingest_corpus.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

KB_TEXT_DIR = Path(os.environ.get("KB_TEXT_DIR", "/var/lib/trt/kb/text"))
MANIFEST = Path(os.environ.get("KB_INGEST_MANIFEST", "/var/lib/trt/kb/graphiti_ingested.json"))
ENV_FILE = Path(os.environ.get("GRAPHITI_ENV", "/opt/trt-rag/.env"))
EMBED_MODEL = os.environ.get("EMBED_MODEL", "all-MiniLM-L6-v2")  # small, fast, ~80MB


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"'))


def has_llm_key() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY") and os.environ["OPENAI_API_KEY"] != "PASTE_KEY_HERE")


def load_manifest() -> dict[str, str]:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {}


def save_manifest(m: dict[str, str]) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2, sort_keys=True))


def build_clients():
    """Construct the LLM (Z.AI) and embedder (local) clients for Graphiti."""
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
    from graphiti_core.embedder.client import EmbedderClient

    base_url = os.environ.get("OPENAI_API_URL", "https://api.z.ai/api/coding/paas/v4")
    model = os.environ.get("MODEL_NAME", "glm-4.6")
    api_key = os.environ["OPENAI_API_KEY"]
    print(f"LLM: {model} @ {base_url}")
    print(f"Embedder: sentence-transformers/{EMBED_MODEL} (local, 384-dim)")

    llm_client = OpenAIGenericClient(
        LLMConfig(api_key=api_key, model=model, base_url=base_url.rstrip("/")),
        # GLM reasoning models burn tokens on reasoning_content; give them room
        # to finish reasoning AND emit the JSON in content. json_object mode is
        # reliably supported by Z.AI; json_schema is not.
        max_tokens=65536,
        structured_output_mode="json_object",
    )

    # Custom local embedder: bridges sentence-transformers into Graphiti.
    from sentence_transformers import SentenceTransformer  # type: ignore

    _model = SentenceTransformer(EMBED_MODEL)
    dim = _model.get_embedding_dimension()

    class LocalEmbedder(EmbedderClient):
        config = type("C", (), {"embedding_dim": dim})()

        async def create(self, input_data):  # type: ignore[override]
            return _model.encode(input_data, normalize_embeddings=True).tolist()

        async def create_batch(self, input_data_list):  # type: ignore[override]
            return _model.encode(input_data_list, normalize_embeddings=True).tolist()

    return llm_client, LocalEmbedder()


async def main() -> int:
    load_env_file(ENV_FILE)

    if not has_llm_key():
        print(
            "No Z.AI key set. Run: bash /opt/trt-rag/set-key.sh\n"
            "or edit /opt/trt-rag/.env and set OPENAI_API_KEY.",
            file=sys.stderr,
        )
        return 2

    if not KB_TEXT_DIR.exists():
        print(f"No extracted text at {KB_TEXT_DIR}. Run: pnpm --filter @trt/kb build", file=sys.stderr)
        return 2

    try:
        from graphiti_core import Graphiti
    except ImportError:
        print('graphiti-core not installed. Run: pip install "graphiti-core[falkordb,sentence-transformers]"', file=sys.stderr)
        return 2

    text_files = sorted(KB_TEXT_DIR.glob("*.txt"))
    manifest = load_manifest()
    pending = [f for f in text_files if manifest.get(f.name) != str(f.stat().st_size)]
    print(f"Source texts: {len(text_files)} total, {len(pending)} pending ingestion.")
    if not pending:
        print("Graph is up to date. Nothing to ingest.")
        return 0

    llm_client, embedder = build_clients()

    # FalkorDB driver (explicit — the default Graphiti() ctor uses Neo4j).
    from graphiti_core.driver.falkordb_driver import FalkorDriver
    driver = FalkorDriver(host="localhost", port=6379)
    client = Graphiti(graph_driver=driver, llm_client=llm_client, embedder=embedder)
    await client.build_indices_and_constraints()

    from datetime import datetime, timezone

    # Large docs blow past the LLM context window ("Prompt 超长"). Chunk each
    # doc into passages of ~CHUNK_CHARS and ingest each as its own episode.
    CHUNK_CHARS = 8000

    def passages(text: str) -> list[str]:
        text = text.strip()
        if len(text) <= CHUNK_CHARS:
            return [text] if text else []
        out = []
        for i in range(0, len(text), CHUNK_CHARS):
            chunk = text[i : i + CHUNK_CHARS].strip()
            # try to break on a paragraph boundary near the end
            if i + CHUNK_CHARS < len(text):
                last_break = chunk.rfind("\n\n")
                if 0 < last_break > CHUNK_CHARS // 2:
                    chunk = chunk[:last_break].strip()
            if chunk and len(chunk) > 200:  # skip tiny fragments
                out.append(chunk)
        return out

    ingested = 0
    for tf in pending:
        title = tf.stem
        try:
            text = tf.read_text(encoding="utf-8", errors="replace")
            chunks = passages(text)
            if not chunks:
                print(f"  . {title}: no usable text, skipping")
                continue
            for idx, chunk in enumerate(chunks):
                try:
                    await client.add_episode(
                        name=f"{title}#{idx + 1}",
                        episode_body=chunk,
                        source_description=f"Corpus document: {title} (part {idx + 1}/{len(chunks)})",
                        reference_time=datetime.now(timezone.utc),
                    )
                except Exception as ce:  # noqa: BLE001
                    # a single bad chunk shouldn't kill the whole doc
                    print(f"  ~ {title} part {idx + 1}/{len(chunks)} skipped: {str(ce)[:80]}", file=sys.stderr)
            manifest[tf.name] = str(tf.stat().st_size)
            save_manifest(manifest)
            ingested += 1
            print(f"  + {title} ({len(chunks)} passage{'s' if len(chunks) != 1 else ''})")
        except Exception as e:  # noqa: BLE001
            print(f"  x {title}: {str(e)[:100]}", file=sys.stderr)

    await client.close()
    print(f"\n+ Ingested {ingested} document(s). Graph built — now a frozen knowledge base.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
