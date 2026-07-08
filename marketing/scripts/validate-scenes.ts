#!/usr/bin/env tsx
/**
 * validate-scenes.ts — enforces the marketing GOLD §6 "Definition of Done":
 *   1. Every scene block is ≤ 512 characters (excluding the "### Scene N" heading line).
 *   2. The final scene of each campaign carries a DISCLAIMER (on-screen).
 *   3. No scene contains a §2.1-prohibited phrase (dose / prescription /
 *      diagnosis / start-stop-change / outcome promise).
 *
 * Scene block format (per marketing/AGENTS.md §3):
 *
 *   ### Scene N — <title>
 *   VOICEOVER: <line>
 *   ON-SCREEN: <line>
 *   CTA: <line>
 *   DISCLAIMER: <line>
 *
 * The "block body" measured for the 512-char limit is the four lines below the
 * heading (VOICEOVER / ON-SCREEN / CTA / DISCLAIMER), joined by "\n".
 *
 * Run:  pnpm tsx marketing/scripts/validate-scenes.ts
 * Exit: 0 = pass, 1 = fail (prints every violation).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CAMPAIGNS_DIR = join(ROOT, "campaigns");
const MAX_CHARS = 512;

// §2.1 prohibited phrasing in marketing creative. Word-boundary, case-insensitive.
// These are guardrail tripwires, not a complete medical-claims checker — a human
// still reviews every campaign (marketing/GOLD.md §6).
const PROHIBITED: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b\d+\s?(mg|mcg|iu|ml|mg\/ml)\b/i, reason: "exact dose" },
  { pattern: /\b(prescri(be|ption|bed))\b/i, reason: "prescription language" },
  { pattern: /\b(diagnos(e|ed|is|tic))\b/i, reason: "diagnosis language" },
  {
    pattern: /\b(start|stop|begin|quit)\s+(taking|using|your|the)?\s*(medication|trt|testosterone|dose|injection)/i,
    reason: "start/stop/change medication",
  },
  {
    pattern: /\b(increase|raise|boost|optimize|lower|fix)\s+(your\s+)?(t|testosterone|levels|estradiol)/i,
    reason: "outcome promise on a hormone",
  },
  { pattern: /\bcure\b/i, reason: "cure claim" },
  { pattern: /\bfda[-\s]?approved\b/i, reason: "FDA-approval claim" },
  { pattern: /\bhipaa[-\s]?certified\b/i, reason: "HIPAA-certification claim" },
];

type Scene = {
  heading: string;
  body: string; // VOICEOVER + ON-SCREEN + CTA + DISCLAIMER — used for the 512-char limit
  creative: string; // VOICEOVER + ON-SCREEN + CTA only — scanned for §2.1 tripwires.
  // The DISCLAIMER line is exempt from the prohibited-phrase scan because it is
  // the safety text that *refutes* those claims ("Not a diagnosis or
  // prescription"). Flagging it would punish compliance.
  disclaimer: string;
  raw: string;
};

function parseScenes(md: string): Scene[] {
  const lines = md.split("\n");
  const scenes: Scene[] = [];
  let cur: Scene | null = null;
  const bodyKeys = new Set(["VOICEOVER:", "ON-SCREEN:", "CTA:", "DISCLAIMER:"]);
  for (const line of lines) {
    if (/^###\s+Scene\b/.test(line)) {
      if (cur) scenes.push(cur);
      cur = { heading: line, body: "", creative: "", disclaimer: "", raw: line };
    } else if (cur) {
      cur.raw += "\n" + line;
      if (bodyKeys.has(line.split(":")[0] + ":")) {
        cur.body += (cur.body ? "\n" : "") + line;
        if (line.startsWith("DISCLAIMER:")) cur.disclaimer = line;
        else cur.creative += (cur.creative ? "\n" : "") + line;
      }
    }
  }
  if (cur) scenes.push(cur);
  return scenes;
}

function findCampaignDirs(): string[] {
  return readdirSync(CAMPAIGNS_DIR)
    .filter((d) => statSync(join(CAMPAIGNS_DIR, d)).isDirectory())
    .map((d) => join(CAMPAIGNS_DIR, d));
}

const violations: string[] = [];

for (const dir of findCampaignDirs()) {
  const file = join(dir, "scripts.md");
  let md: string;
  try {
    md = readFileSync(file, "utf8");
  } catch {
    violations.push(`${file}: missing scripts.md`);
    continue;
  }
  const scenes = parseScenes(md);
  if (scenes.length === 0) {
    violations.push(`${file}: no scenes found`);
    continue;
  }
  const name = dir.split("/").pop();
  scenes.forEach((s, i) => {
    const len = s.body.length;
    if (len > MAX_CHARS) {
      violations.push(`${name} scene ${i + 1}: ${len} chars > ${MAX_CHARS} (512)`);
    }
    for (const p of PROHIBITED) {
      if (p.pattern.test(s.creative)) {
        violations.push(`${name} scene ${i + 1}: prohibited "${p.reason}"`);
      }
    }
  });
  const last = scenes[scenes.length - 1];
  if (!/DISCLAIMER:\s*\S/.test(last.body)) {
    violations.push(`${name}: final scene missing DISCLAIMER`);
  }
}

if (violations.length) {
  console.error("❌ marketing scenes validation FAILED:\n");
  for (const v of violations) console.error("  - " + v);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

console.log("✅ marketing scenes OK — all scenes ≤ 512 chars, disclaimers present, no §2.1 tripwires.");
