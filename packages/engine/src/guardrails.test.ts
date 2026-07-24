/**
 * Wiring test: `@trt/engine` re-exports the canonical guardrail package.
 * The full behavior suite lives in `packages/guardrails/src/guardrails.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { enforceGuardrails, refuseAndRedirect, assertConsumerSafe } from './guardrails';

describe('engine guardrails — canonical package wiring', () => {
  it('blocks dosing content (not a passthrough)', () => {
    const r = enforceGuardrails('Recommend 200 mg of testosterone cypionate weekly.');
    expect(r.ok).toBe(false);
    expect(r.blocked.length).toBeGreaterThan(0);
  });

  it('blocks all major compound families', () => {
    for (const s of [
      'Use 200mg nandrolone decanoate every week.',
      '100mg trenbolone acetate EOD.',
      'Take 50 mg oxandrolone daily.',
      'Add 500 IU of hCG twice weekly.',
      'Start anastrozole 0.5 mg twice a week.',
    ]) {
      expect(enforceGuardrails(s).ok, s).toBe(false);
    }
  });

  it('passes benign trend prose', () => {
    expect(
      enforceGuardrails('Your total testosterone trended from 380 to 412 ng/dL over six months.').ok,
    ).toBe(true);
  });

  it('refuseAndRedirect refuses without dosing content', () => {
    const msg = refuseAndRedirect('dose?');
    expect(msg).toContain("can't provide");
    expect(enforceGuardrails(msg).ok).toBe(true);
  });

  it('assertConsumerSafe fails closed', () => {
    expect(() => assertConsumerSafe({ dose: '200 mg testosterone weekly' })).toThrow();
    expect(() => assertConsumerSafe({ note: 'within the reference range' })).not.toThrow();
  });
});
