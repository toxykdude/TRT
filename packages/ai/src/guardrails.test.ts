/**
 * Guardrail golden cases (GOLD §2, AGENTS.md §8).
 *
 * These are the most important tests in the repo. They pin the Prime Directive
 * into the build: prohibited content (dosages, prescriptions, diagnoses,
 * schedules, start/stop instructions) is always blocked; legitimate support
 * content always passes. If a model regression slips a dosage through, these
 * tests catch it before merge.
 */
import { describe, it, expect } from 'vitest';
import { enforceGuardrails } from './guardrails';

describe('enforceGuardrails — must BLOCK (GOLD §2.3 prohibitions)', () => {
  it('blocks exact testosterone dosages', () => {
    const r = enforceGuardrails('You should take 200 mg of testosterone per week.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('exact testosterone dosage');
  });

  it('blocks "take N mg testosterone" phrasing', () => {
    const r = enforceGuardrails('Take 100mg testosterone enanthate');
    expect(r.ok).toBe(false);
  });

  it('blocks exact hCG dosages', () => {
    const r = enforceGuardrails('Add 500 IU of hCG twice weekly.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('exact hCG dosage');
  });

  it('blocks aromatase inhibitor dosages', () => {
    const r = enforceGuardrails('Start anastrozole 0.5 mg twice a week.');
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes('aromatase'))).toBe(true);
  });

  it('blocks generic dosing schedules / titration', () => {
    const r = enforceGuardrails('Increase to 150mg weekly and titrate from there.');
    expect(r.ok).toBe(false);
  });

  it('blocks prescription language', () => {
    const r = enforceGuardrails("I'll prescribe you testosterone cypionate.");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('prescription language');
  });

  it('blocks instructions to change medication', () => {
    const r = enforceGuardrails('You should stop your testosterone and lower the dose.');
    expect(r.ok).toBe(false);
  });

  it('blocks definitive diagnoses', () => {
    const r = enforceGuardrails('You have low T and you are hypogonadal.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('definitive diagnosis');
  });
});

describe('enforceGuardrails — must PASS (legitimate support content)', () => {
  it('passes a plain trend summary', () => {
    const r = enforceGuardrails(
      'Your total testosterone trended from 380 to 412 ng/dL over six months, remaining within the typical range.',
    );
    expect(r.ok).toBe(true);
  });

  it('passes a range comparison', () => {
    const r = enforceGuardrails(
      'Hematocrit of 54% sits above the typical reference upper bound of 53%.',
    );
    expect(r.ok).toBe(true);
  });

  it('passes a discussion-point suggestion', () => {
    const r = enforceGuardrails(
      'This is worth discussing with your physician to determine whether further evaluation is appropriate.',
    );
    expect(r.ok).toBe(true);
  });

  it('passes a guideline reference', () => {
    const r = enforceGuardrails(
      'Endocrine Society guidance recommends interpreting testosterone alongside symptoms.',
    );
    expect(r.ok).toBe(true);
  });
});

describe('enforceGuardrails — allowlist (historical record context, GOLD §5.11)', () => {
  it('allows mention of a historical dose in a record context', () => {
    const r = enforceGuardrails(
      'Historical dose on file: the patient was previously prescribed 100 mg testosterone weekly.',
    );
    expect(r.ok).toBe(true);
  });

  it('allows a "discuss with your physician" dosage redirect', () => {
    const r = enforceGuardrails(
      'If you are considering a 200 mg dose, please discuss the risks with your physician first.',
    );
    expect(r.ok).toBe(true);
  });
});
