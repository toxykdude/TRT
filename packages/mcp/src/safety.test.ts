/**
 * Guardrail surface audit (GOLD §2 / AGENTS.md §1).
 *
 * The MCP server is retrieval-only, but every string it surfaces to a model —
 * instructions, tool descriptions, prompt templates, result envelopes — must
 * itself pass the deterministic guardrail filter, and clinical-content tools
 * must always carry the mandatory disclaimer. If a future edit drifts into
 * prescriptive/diagnostic phrasing, these tests fail.
 */
import { describe, expect, it } from 'vitest';
import { enforceGuardrails } from '@trt/engine';
import { DISCLAIMER, SERVER_INSTRUCTIONS } from './safety.js';
import { buildGroundedAnswerPrompt } from './prompts.js';
import { createServer } from './server.js';

/** The exact GOLD §2.5 string — must stay byte-identical across the platform. */
const EXPECTED_DISCLAIMER =
  'This software provides educational and organizational support only. It does not ' +
  'diagnose medical conditions or prescribe treatment. All treatment decisions must ' +
  'be made by a qualified healthcare professional.';

describe('mandatory disclaimer', () => {
  it('matches GOLD §2.5 verbatim', () => {
    expect(DISCLAIMER).toBe(EXPECTED_DISCLAIMER);
  });

  it('is embedded in the server instructions', () => {
    expect(SERVER_INSTRUCTIONS).toContain(EXPECTED_DISCLAIMER);
  });
});

describe('guardrail audit of the whole model-facing surface', () => {
  it('server instructions pass the guardrail filter', () => {
    const audit = enforceGuardrails(SERVER_INSTRUCTIONS);
    expect(audit.ok, `instructions blocked: ${audit.reasons.join(', ')}`).toBe(true);
  });

  it('prompt template passes the guardrail filter', () => {
    const text = buildGroundedAnswerPrompt('What does the corpus say about estradiol monitoring?');
    const audit = enforceGuardrails(text);
    expect(audit.ok, `prompt blocked: ${audit.reasons.join(', ')}`).toBe(true);
    expect(text).toContain(EXPECTED_DISCLAIMER);
  });

  it('every tool description passes the guardrail filter', () => {
    // Inspect the registered tools via the server's internal registry.
    const server = createServer();
    const registered = (server as unknown as { _registeredTools: Record<string, { description?: string; title?: string }> })
      ._registeredTools;
    const names = Object.keys(registered);
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const name of names) {
      const t = registered[name]!;
      const text = `${name}\n${t.title ?? ''}\n${t.description ?? ''}`;
      const audit = enforceGuardrails(text);
      expect(audit.ok, `tool "${name}" description blocked: ${audit.reasons.join(', ')}`).toBe(true);
    }
  });
});
