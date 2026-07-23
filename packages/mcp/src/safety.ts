/**
 * Clinical safety surface for the MCP server (GOLD §2 / AGENTS.md §1).
 *
 * This server is RETRIEVAL-ONLY. It returns cited source material from the
 * corpus knowledge base, the Graphiti knowledge graph, and platform documents.
 * It contains no generative model and produces no clinical advice of its own.
 *
 * Defense-in-depth:
 *   1. Every clinical-content tool response embeds the mandatory disclaimer
 *      (same string the web app renders — SAFETY_DISCLAIMER).
 *   2. Server instructions + tool descriptions are guardrail-audited against
 *      @trt/engine's enforceGuardrails in tests (safety.test.ts).
 *   3. The server never touches the patient database — no PHI crosses MCP.
 */

/** The mandatory clinical disclaimer (GOLD §2.5) — verbatim, single source. */
export const DISCLAIMER =
  'This software provides educational and organizational support only. It does not ' +
  'diagnose medical conditions or prescribe treatment. All treatment decisions must ' +
  'be made by a qualified healthcare professional.';

/**
 * Server-level instructions presented to every connecting MCP client/model.
 * Written so the model treats all returned content as cited source material,
 * not as clinical advice.
 */
export const SERVER_INSTRUCTIONS = [
  'TRT knowledge retrieval server (read-only).',
  '',
  'You are connected to the knowledge stack of a clinical decision SUPPORT tool.',
  'All content returned here is CITED SOURCE MATERIAL from a medical corpus',
  '(knowledge base passages and knowledge-graph relationship facts), retrieved',
  'deterministically. It is not advice, and it is never patient-specific.',
  '',
  'Rules for using this content (GOLD §2):',
  '- Use retrieved passages/facts only as cited evidence; attribute the source.',
  '- NEVER present a medication dosage, schedule, or titration plan as a',
  '  recommendation. If a retrieved passage mentions a historical or published',
  '  dosage, report it strictly as cited source content, never as guidance.',
  '- NEVER render a diagnosis. NEVER tell anyone to start, stop, or change a',
  '  medication.',
  '- Reference ranges are per-lab/per-assay; never treat one range as global.',
  '- All treatment decisions belong to a qualified healthcare professional.',
  '',
  DISCLAIMER,
].join('\n');

/**
 * Audit a piece of text this server will surface (description, instructions,
 * prompt template) against the GOLD §2 guardrails. Kept here so tests can
 * assert the whole surface passes — and so a future maintainer who edits any
 * user/model-facing string gets an immediate test failure if it drifts into
 * prescriptive/diagnostic phrasing.
 */
export { enforceGuardrails as auditSurface } from '@trt/engine';
