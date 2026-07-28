/**
 * Plan catalog constants (spec: streamline-upload-to-insight — FREE allowance).
 *
 * A FREE account MUST receive exactly one extraction so the core upload→insight
 * loop is demoable without payment (spec §"FREE extraction allowance"). Before
 * this change FREE.uploadsPerMonth was 0 (full paywall on the primary value).
 *
 * This suite pins the new FREE allowance and guards against accidentally
 * perturbing the paid tiers (triangulation).
 */
import { describe, it, expect } from 'vitest';
import { PLANS } from '@/lib/plans';

describe('PLANS.FREE extraction allowance', () => {
  it('grants exactly one extraction per month (FREE is no longer a hard paywall)', () => {
    expect(PLANS.FREE.quotas.uploadsPerMonth).toBe(1);
  });

  it('keeps the FREE report quota at 1/quarter (unchanged by this change)', () => {
    expect(PLANS.FREE.quotas.reportsPerQuarter).toBe(1);
  });

  it('does not alter paid-tier upload allowances (change is scoped to FREE)', () => {
    // Triangulation: if the implementation flipped every tier, these break.
    expect(PLANS.PLUS_MONTHLY.quotas.uploadsPerMonth).toBe(10);
    expect(PLANS.PLUS_YEARLY.quotas.uploadsPerMonth).toBe(10);
    expect(PLANS.PRO_MONTHLY.quotas.uploadsPerMonth).toBe(50);
  });
});
