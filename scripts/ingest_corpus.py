#!/usr/bin/env python3
"""
Ingest the extracted corpus text into the Graphiti knowledge graph.

This is the "build once, freeze" step for Goal 2. Ingestion uses an LLM
(Graphiti requires one for entity/edge extraction); afterward the graph is a
static knowledge base queryable deterministically (embeddings + graph traversal,
no generative LLM at query time).

PREREQUISITES:
  - Graphiti installed in a venv:  pip install "graphiti-core[neo4j]"
  - Graph DB running (Neo4j or FalkorDB)
  - An LLM key set in the environment (OPENAI_API_KEY etc.)
  - The deterministic KB already built (pnpm --filter @trt/kb build), so that
    the extracted text files exist under KB_TEXT_DIR.

USAGE:
  python3 ingest_corpus.py

GATED: exits with a clear message if no LLM key is set (the graph cannot be
built without one). Re-runnable; tracks ingested sources in a manifest.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

KB_TEXT_DIR = Path(os.environ.get("KB_TEXT_DIR", "/var/lib/trt/kb/text"))
MANIFEST = Path(os.environ.get("KB_INGEST_MANIFEST", "/var/lib/trt/kb/graphiti_ingested.json"))


def has_llm_key() -> bool:
    return bool(
        os.environ.get("OPENAI_API_KEY")
        or os.environ.get("ANTHROPIC_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GROQ_API_KEY")
        or os.environ.get("AZURE_OPENAI_API_KEY")
    )


def load_manifest() -> dict[str, str]:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {}


def save_manifest(m: dict[str, str]) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2, sort_keys=True))


async def main() -> int:
    if not has_llm_key():
        print(
            "No LLM key found (OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY / GROQ_API_KEY).\n"
            "Graphiti requires an LLM to build the knowledge graph. Set a key and re-run:\n"
            "  export OPENAI_API_KEY=sk-...\n"
            "  python3 scripts/ingest_corpus.py\n"
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
    except ImportError:
        print(
            "graphiti-core is not installed. In the venv run:\n"
            '  pip install "graphiti-core[neo4j]"   # or [falkordb]',
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

    # Graphiti reads its config from environment / config.yaml.
    client = Graphiti()
    await client.build_index()

    ingested = 0
    for tf in pending:
        title = tf.stem
        try:
            text = tf.read_text(encoding="utf-8", errors="replace")
            # Ingest as a single episode per source document. Graphiti will
            # extract entities/edges via the configured LLM.
            await client.add_episode(
                name=title,
                episode_body=text,
                source_description=f"Corpus document: {title}",
                reference_time=None,
            )
            manifest[tf.name] = tf.stat().st_size
            save_manifest(manifest)
            ingested += 1
            print(f"  ✓ {title}")
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {title}: {e}", file=sys.stderr)

    await client.close()
    print(f"\n✓ Ingested {ingested} document(s). Graph build complete — it is now a frozen knowledge base.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
