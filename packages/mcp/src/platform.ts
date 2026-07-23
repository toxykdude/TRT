/**
 * Platform knowledge — repo documents (GOLD.md, docs/*) and engine metadata.
 * Third knowledge source behind the MCP tools/resources.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BIOMARKER_DISPLAY_NAMES, EXPECTED_PANEL, SEARCH_PHRASES } from '@trt/engine';
import { REPO_ROOT } from './config.js';

/** Map of platform doc keys → repo-relative markdown files. */
export const PLATFORM_DOCS = {
  gold: 'GOLD.md',
  agents: 'AGENTS.md',
  readme: 'README.md',
  'docs/engine': 'docs/ENGINE.md',
  'docs/rag': 'docs/RAG.md',
  'docs/deployment': 'docs/DEPLOYMENT.md',
  'docs/mcp': 'docs/MCP.md',
} as const;

export type PlatformDocKey = keyof typeof PLATFORM_DOCS;

export async function readPlatformDoc(key: PlatformDocKey): Promise<string | null> {
  try {
    return await readFile(join(REPO_ROOT, PLATFORM_DOCS[key]), 'utf8');
  } catch {
    return null;
  }
}

/** The platform service map (as deployed; see docs/RAG.md + docs/DEPLOYMENT.md). */
export function platformServices(): Array<{ service: string; port: number | null; role: string }> {
  return [
    { service: 'web (Next.js, pm2 "trt")', port: 3000, role: 'patient/clinician UI + API' },
    { service: 'postgres', port: 5432, role: 'patient data (RLS; never exposed via MCP)' },
    {
      service: 'graph query service (pm2 "trt-graph")',
      port: 8001,
      role: 'Layer 2 graph retrieval (embedder + Neo4j)',
    },
    { service: 'neo4j (bolt)', port: 7687, role: 'Graphiti knowledge-graph store' },
    {
      service: 'graphiti MCP (optional)',
      port: 8000,
      role: 'upstream Graphiti MCP (not the primary query path)',
    },
    { service: 'falkordb (optional)', port: 6379, role: 'alternative graph backend' },
    { service: 'trt-mcp (this server)', port: null, role: 'MCP retrieval surface for AI models' },
  ];
}

/** Engine metadata: deterministic pipeline + biomarker panels/phrases. */
export function engineMetadata() {
  return {
    pipeline: ['classify', 'trends', 'rules', 'coverageGaps', 'assembleReport', 'guardrailAudit'],
    determinism: 'same inputs → same report (sha256 hash); no AI model in analysis',
    expectedPanels: EXPECTED_PANEL,
    biomarkerDisplayNames: BIOMARKER_DISPLAY_NAMES,
    biomarkerSearchPhrases: SEARCH_PHRASES,
  };
}

/** Reverse map: biomarker key → panel categories that expect it. */
export function biomarkerCategories(key: string): string[] {
  return Object.entries(EXPECTED_PANEL)
    .filter(([, keys]) => keys.includes(key))
    .map(([category]) => category);
}
