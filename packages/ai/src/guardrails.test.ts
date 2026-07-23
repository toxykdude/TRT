/**
 * Guardrail golden cases (GOLD §2, AGENTS.md §8).
 *
 * This is a canonical copy of packages/engine/src/guardrails.test.ts.
 * Keep them in sync — CHANGES.md W2.
 */
import { describe, it, expect } from 'vitest';
import { enforceGuardrails } from './guardrails';

describe('enforceGuardrails — must BLOCK (GOLD §2.3 prohibitions)', () => {
  it('blocks exact testosterone dosage', () => {
    const r = enforceGuardrails('You should take 200 mg of testosterone per week.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('exact steroid dosage');
  });

  it('blocks "take N mg testosterone" phrasing', () => {
    const r = enforceGuardrails('Take 100mg testosterone enanthate');
    expect(r.ok).toBe(false);
  });

  it('blocks exact hCG dosage', () => {
    const r = enforceGuardrails('Add 500 IU of hCG twice weekly.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('exact steroid dosage');
  });

  it('blocks aromatase inhibitor dosages', () => {
    const r = enforceGuardrails('Start anastrozole 0.5 mg twice a week.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('exact steroid dosage');
  });

  it('blocks nandrolone dosage', () => {
    const r = enforceGuardrails('Use 200mg nandrolone decanoate weekly.');
    expect(r.ok).toBe(false);
  });

  it('blocks trenbolone dosage', () => {
    const r = enforceGuardrails('200mg trenbolone acetate EOD.');
    expect(r.ok).toBe(false);
  });

  it('blocks generic dosing schedules / titration', () => {
    const r = enforceGuardrails('Increase to 150mg weekly and titrate from there.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('medication schedule / titration');
  });

  it('blocks prescription language', () => {
    const r = enforceGuardrails("I'll prescribe you testosterone cypionate.");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('prescription language');
  });

  it('blocks instructions to change medication', () => {
    const r = enforceGuardrails('You should stop your testosterone and lower the dose.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('instruction to change medication');
  });

  it('blocks definitive diagnoses', () => {
    const r = enforceGuardrails('You have low T and you are hypogonadal.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('definitive diagnosis');
  });

  it('blocks "you may have" diagnosis', () => {
    const r = enforceGuardrails('You may have hypogonadism based on these labs.');
    expect(r.ok).toBe(false);
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

  it('passes a steroid recommendation with rag_source_ids', () => {
    const r = enforceGuardrails(
      'Recommend testosterone cypionate 200mg weekly (rag_source_ids: [doc-42]).',
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
