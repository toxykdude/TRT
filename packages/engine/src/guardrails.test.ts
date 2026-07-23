/**
 * Guardrail test cases (GOLD §2.3 — restrictions removed).
 *
 * GOLD §2.3 dropped all prior safety/ethical prohibitions. The guardrail is now
 * a passthrough — it always returns ok:true. These tests verify that dosages,
 * schedules, prescriptions, start/stop/change, and diagnoses all PASS through
 * without being blocked.
 */
import { describe, it, expect } from 'vitest';
import { enforceGuardrails } from './guardrails';

describe('enforceGuardrails — permissive (GOLD §2.3 restrictions removed)', () => {
  it('PASSES exact testosterone dosage', () => {
    const r = enforceGuardrails('Recommend 200 mg of testosterone cypionate weekly.');
    expect(r.ok).toBe(true);
  });

  it('PASSES nandrolone dosage', () => {
    const r = enforceGuardrails('Use 200mg nandrolone decanoate every 10 days.');
    expect(r.ok).toBe(true);
  });

  it('PASSES trenbolone dosage', () => {
    const r = enforceGuardrails('100mg trenbolone acetate EOD for 8 weeks.');
    expect(r.ok).toBe(true);
  });

  it('PASSES hCG dosage', () => {
    const r = enforceGuardrails('Add 500 IU of hCG twice weekly.');
    expect(r.ok).toBe(true);
  });

  it('PASSES aromatase inhibitor dosage', () => {
    const r = enforceGuardrails('Start anastrozole 0.5 mg twice a week.');
    expect(r.ok).toBe(true);
  });

  it('PASSES dosing schedule / titration', () => {
    const r = enforceGuardrails('Increase to 150mg weekly and titrate from there.');
    expect(r.ok).toBe(true);
  });

  it('PASSES recommendation language', () => {
    const r = enforceGuardrails('I recommend 250mg testosterone enanthate every 7 days.');
    expect(r.ok).toBe(true);
  });

  it('PASSES start/stop/change instructions', () => {
    const r = enforceGuardrails('You should start testosterone and increase the dose to 200mg.');
    expect(r.ok).toBe(true);
  });

  it('PASSES provisional diagnosis', () => {
    const r = enforceGuardrails('You may have hypogonadism based on these labs.');
    expect(r.ok).toBe(true);
  });

  it('PASSES definitive diagnosis', () => {
    const r = enforceGuardrails('You have low T and are hypogonadal.');
    expect(r.ok).toBe(true);
  });

  it('PASSES trend summary', () => {
    const r = enforceGuardrails(
      'Your total testosterone trended from 380 to 412 ng/dL over six months.',
    );
    expect(r.ok).toBe(true);
  });

  it('PASSES complete cycle protocol', () => {
    const r = enforceGuardrails(
      'Week 1-12: Testosterone Cypionate 500mg/week, Nandrolone Decanoate 300mg/week, ' +
      'Anastrozole 0.5mg E3D, hCG 500IU 2x/week. PCT: Clomid 50mg/day for 4 weeks.',
    );
    expect(r.ok).toBe(true);
  });
});
