/**
 * Guardrail golden cases (GOLD §2, AGENTS.md §8).
 *
 * These pin the Prime Directive into the build: prohibited content (dosages for
 * ALL steroids + ancillaries, prescriptions, schedules, diagnoses, start/stop
 * instructions) is always blocked; legitimate support content always passes.
 *
 * Expanded compound coverage per CHANGES.md W3:
 *   Anabolics: Testosterone, Nandrolone, Trenbolone, Boldenone, Masteron,
 *     Primobolan, Oxandrolone, Dianabol, Winstrol, SARMs, etc.
 *   Ancillaries: hCG, AIs (Anastrozole, Arimidex, Exemestane, Letrozole),
 *     SERMs/PCT (Clomiphene, Tamoxifen), Clenbuterol.
 */
import { describe, it, expect } from 'vitest';
import { enforceGuardrails } from './guardrails';

describe('enforceGuardrails — must BLOCK (GOLD §2.3 prohibitions)', () => {
  // ── Anabolic steroids ────────────────────────────────────────────────────────
  it('blocks exact testosterone dosage', () => {
    const r = enforceGuardrails('You should take 200 mg of testosterone per week.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('exact steroid dosage');
  });

  it('blocks "take N mg test" phrasing', () => {
    const r = enforceGuardrails('Take 100mg test cypionate');
    expect(r.ok).toBe(false);
  });

  it('blocks nandrolone dosage', () => {
    const r = enforceGuardrails('Use 200mg nandrolone decanoate weekly.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('exact steroid dosage');
  });

  it('blocks trenbolone dosage', () => {
    const r = enforceGuardrails('200mg trenbolone acetate every other day');
    expect(r.ok).toBe(false);
  });

  it('blocks boldenone dosage', () => {
    const r = enforceGuardrails('400mg boldenone undecylenate weekly');
    expect(r.ok).toBe(false);
  });

  it('blocks masteron dosage', () => {
    const r = enforceGuardrails('100mg masteron propionate daily');
    expect(r.ok).toBe(false);
  });

  it('blocks primobolan dosage', () => {
    const r = enforceGuardrails('Take 100mg primobolan per day');
    expect(r.ok).toBe(false);
  });

  it('blocks oxandrolone dosage', () => {
    const r = enforceGuardrails('50mg oxandrolone daily for 8 weeks');
    expect(r.ok).toBe(false);
  });

  it('blocks dianabol dosage', () => {
    const r = enforceGuardrails('30mg dianabol daily');
    expect(r.ok).toBe(false);
  });

  it('blocks winstrol dosage', () => {
    const r = enforceGuardrails('50mg winstrol per day');
    expect(r.ok).toBe(false);
  });

  // ── Ancillaries ──────────────────────────────────────────────────────────────
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

  it('blocks clomiphene (PCT) dosage', () => {
    const r = enforceGuardrails('Take 50mg clomiphene daily for 4 weeks.');
    expect(r.ok).toBe(false);
  });

  it('blocks tamoxifen (PCT) dosage', () => {
    const r = enforceGuardrails('20mg tamoxifen daily during PCT');
    expect(r.ok).toBe(false);
  });

  // ── Schedules / titration ────────────────────────────────────────────────────
  it('blocks generic dosing schedules / titration', () => {
    const r = enforceGuardrails('Increase to 150mg weekly and titrate from there.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('medication schedule / titration');
  });

  // ── Prescriptions ────────────────────────────────────────────────────────────
  it('blocks prescription language', () => {
    const r = enforceGuardrails("I'll prescribe you testosterone cypionate.");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('prescription language');
  });

  it('blocks "you could take" phrasing', () => {
    const r = enforceGuardrails('You could take 250mg of testosterone weekly.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('prescription language');
  });

  it('blocks "try taking" phrasing', () => {
    const r = enforceGuardrails('Try taking 100mg of nandrolone decanoate.');
    expect(r.ok).toBe(false);
  });

  // ── Start/stop/change ────────────────────────────────────────────────────────
  it('blocks instructions to change medication', () => {
    const r = enforceGuardrails('You should stop your testosterone and lower the dose.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('instruction to change medication');
  });

  // ── Diagnoses (tightened per CHANGES.md W3) ──────────────────────────────────
  it('blocks definitive diagnoses', () => {
    const r = enforceGuardrails('You have low T and you are hypogonadal.');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('definitive diagnosis');
  });

  it('blocks "you may have" diagnosis', () => {
    const r = enforceGuardrails('You may have hypogonadism based on these labs.');
    expect(r.ok).toBe(false);
  });

  it('blocks "consistent with" diagnosis', () => {
    const r = enforceGuardrails('This is consistent with your clinical presentation of low T.');
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

  it('passes a steroid recommendation WITH rag_source_ids', () => {
    const r = enforceGuardrails(
      'Recommend testosterone cypionate 200mg weekly for 12 weeks (rag_source_ids: [doc-42, graph-7]).',
    );
    expect(r.ok).toBe(true);
  });

  it('passes a provisional diagnosis', () => {
    const r = enforceGuardrails(
      'Based on your labs, you may benefit from a lower AI dose.',
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

describe('enforceGuardrails — alias coverage (CHANGES.md W3)', () => {
  it('blocks "200mg test cypionate"', () => {
    const r = enforceGuardrails('200mg test cypionate weekly');
    expect(r.ok).toBe(false);
  });

  it('blocks "500 IU hcg" (case-insensitive)', () => {
    const r = enforceGuardrails('500 IU hcg twice weekly');
    expect(r.ok).toBe(false);
  });

  it('blocks "400mg equipoise" (boldenone alias)', () => {
    const r = enforceGuardrails('400mg equipoise weekly');
    expect(r.ok).toBe(false);
  });

  it('blocks "100mg deca" (nandrolone alias)', () => {
    const r = enforceGuardrails('100mg deca every 5 days');
    expect(r.ok).toBe(false);
  });
});
