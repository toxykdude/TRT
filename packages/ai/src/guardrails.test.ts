/**
 * Wiring test: `@trt/ai` re-exports the canonical guardrail package.
 * The full behavior suite lives in `packages/guardrails/src/guardrails.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { enforceGuardrails, refuseAndRedirect, assertConsumerSafe } from './guardrails';

describe('ai guardrails — canonical package wiring', () => {
  it('blocks dosing content (not a passthrough)', () => {
    const r = enforceGuardrails('Take 20 mg tamoxifen daily.');
    expect(r.ok).toBe(false);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it('passes benign classification prose', () => {
    expect(
      enforceGuardrails('Estradiol is 35 pg/mL, within the reference range of 10 - 40 pg/mL.').ok,
    ).toBe(true);
  });

  it('refuseAndRedirect output itself passes the filter', () => {
    expect(enforceGuardrails(refuseAndRedirect('cycle help')).ok).toBe(true);
  });

  it('assertConsumerSafe fails closed on dosing payloads', () => {
    expect(() => assertConsumerSafe('PCT: clomiphene 50 mg daily for 4 weeks.')).toThrow();
  });
});
