#!/usr/bin/env python3
"""
Ingest the extracted corpus text into the Graphiti knowledge graph.

This is the "build once, freeze" step for Goal 2. Ingestion uses an LLM
(Graphiti requires one for entity/edge extraction); afterward the graph is a
static knowledge base queryable deterministically (embeddings + graph traversal,
no generative LLM at query time).

PROVIDER CONFIG:
  The recommended setup uses Z.AI as the LLM (OpenAI-compatible) plus a LOCAL
  sentence-transformers embedder, because Z.AI's global endpoint has no
  embeddings API. Run `scripts/configure-zai.sh` first to generate the env.

PREREQUISITES:
  - scripts/configure-zai.sh has been run (wrote /opt/trt-rag/graphiti.env)
  - Graphiti + falkordb + sentence-transformers installed in a venv:
        pip install "graphiti-core[falkordb,sentence-transformers]"
  - FalkorDB running (docker compose stack)
  - The deterministic KB already built (pnpm --filter @trt/kb build)

USAGE:
  python3 scripts/ingest_corpus.py

GATED: exits with a clear message if no LLM key is set. Re-runnable; tracks
ingested sources in a manifest.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

KB_TEXT_DIR = Path(os.environ.get("KB_TEXT_DIR", "/var/lib/trt/kb/text"))
MANIFEST = Path(os.environ.get("KB_INGEST_MANIFEST", "/var/lib/trt/kb/graphiti_ingested.json"))
ENV_FILE = Path(os.environ.get("GRAPHITI_ENV", "/opt/trt-rag/graphiti.env"))


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE lines from the generated env into os.environ (no override)."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"')
        os.environ.setdefault(k, v)


def has_llm_key() -> bool:
    return bool(
        os.environ.get("OPENAI_API_KEY")
        or os.environ.get("ANTHROPIC_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GROQ_API_KEY")
    )


def load_manifest() -> dict[str, str]:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {}


def save_manifest(m: dict[str, str]) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2, sort_keys=True))


async def main() -> int:
    load_env_file(ENV_FILE)

    if not has_llm_key():
        print(
            "No LLM key found. Run the configurator first (it reads your Z.AI key masked):\n"
            "  ./scripts/configure-zai.sh\n"
            "or set one manually:\n"
            "  export OPENAI_API_KEY=...\n"
            "Nothing was ingested; the deterministic KB (@trt/kb) is unaffected.",
            file=sys.stderr,
        )
        return 2

    if not KB_TEXT_DIR.exists():
        print(
            f"No extracted text at {KB_TEXT_DIR}. Build the deterministic KB first:\n"
            "  pnpm --filter @trt/kb build",
            file=sys.stderr,
        )
        return 2

    try:
        from graphiti import Graphiti  # type: ignore
        from graphiti.llm_client.config import LLMConfig  # type: ignore
        from graphiti.llm_client.openai_generic_client import OpenAIGenericClient  # type: ignore
    except ImportError:
        print(
            "graphiti-core is not installed. In the venv run:\n"
            '  pip install "graphiti-core[falkordb,sentence-transformers]"',
            file=sys.stderr,
        )
        return 2

    text_files = sorted(KB_TEXT_DIR.glob("*.txt"))
    manifest = load_manifest()
    pending = [f for f in text_files if manifest.get(f.name) != f.stat().st_size]
    print(f"Source texts: {len(text_files)} total, {len(pending)} pending ingestion.")
    if not pending:
        print("Graph is up to date. Nothing to ingest.")
        return 0

    # Configure: Z.AI as LLM (OpenAI-compatible), local sentence-transformers embedder.
    base_url = os.environ.get("OPENAI_API_URL", "https://api.z.ai/api/coding/paas/v4")
    model = os.environ.get("MODEL_NAME", "glm-4.6")
    api_key = os.environ.get("OPENAI_API_KEY", "")
    print(f"LLM: {model} @ {base_url}")
    print("Embedder: sentence-transformers (local)")

    llm_config = LLMConfig(
        api_base=base_url.rstrip("/"),
        model=model,
        api_key=api_key,
    )
    llm_client = OpenAIGenericClient(llm_config)

    # FalkorDB connection (matches the docker compose stack, no auth).
    falkor_uri = os.environ.get("FALKORDB_URI", "redis://localhost:6379")
    client = Graphiti(
        driver_type="falkordb",
        driver_config={"uri": falkor_uri},
        llm_client=llm_client,
        embedder_config={"provider": "sentence_transformers"},
    )
    await client.build_index()

    ingested = 0
    for tf in pending:
        title = tf.stem
        try:
            text = tf.read_text(encoding="utf-8", errors="replace")
            await client.add_episode(
                name=title,
                episode_body=text,
                source_description=f"Corpus document: {title}",
                reference_time=None,
            )
            manifest[tf.name] = tf.stat().st_size
            save_manifest(manifest)
            ingested += 1
            print(f"  + {title}")
        except Exception as e:  # noqa: BLE001
            print(f"  x {title}: {e}", file=sys.stderr)

    await client.close()
    print(f"\n+ Ingested {ingested} document(s). Graph built — now a frozen knowledge base.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

