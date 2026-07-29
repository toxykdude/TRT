/**
 * Upload-zone auto-extract orchestration logic (streamline-upload-to-insight
 * §2.2 / design.md "Sequence").
 *
 * After a successful upload the client auto-chains extraction, then progresses
 * to a locale-prefixed route: review-required → the review surface, else
 * analysis. Errors must be structured: 402 → upgrade dialog, anything else →
 * inline retry/manual entry (never a silent swallow).
 *
 * Test-layer note: this repo's vitest runs in the `node` environment with no
 * DOM/testing-library (it only collects `tests/unit` `.test.ts` files).
 * codebase convention (e.g. reports-list.test.ts) and the Extract-Before-Mock
 * rule, the orchestration DECISIONS are extracted into pure helpers in
 * `src/lib/extract-flow.ts` and unit-tested here. The React component wiring
 * (spinner/badge/dialog render) is verified by typecheck + the manual Playwright
 * runtime harness (design.md Testing Strategy). Hence `.test.ts`, not `.tsx`.
 */
import { describe, it, expect } from 'vitest';
import { extractRedirectTarget, classifyExtractResponse } from '@/lib/extract-flow';
import type { QuotaPayload } from '@/components/dashboard/quota-exceeded-dialog';

const quotaBody: QuotaPayload = {
  error: 'quota_exceeded',
  kind: 'UPLOAD',
  plan: 'FREE',
  used: 1,
  limit: 1,
  period: '2026-07',
  upgradeUrl: '/en/pricing',
};

describe('extractRedirectTarget — locale-prefixed progression', () => {
  it('routes to analysis when there are no review-required values', () => {
    expect(extractRedirectTarget(0, 'en', 'lr1')).toBe('/en/dashboard/analysis');
  });

  it('routes to the review surface for the uploaded report when pendingReview > 0', () => {
    expect(extractRedirectTarget(3, 'en', 'lr1')).toBe('/en/dashboard/labs/review/lr1');
  });

  it('preserves a non-default locale on the review route', () => {
    expect(extractRedirectTarget(1, 'es', 'lr1')).toBe('/es/dashboard/labs/review/lr1');
  });

  it('preserves locale on the analysis route too', () => {
    expect(extractRedirectTarget(0, 'es', 'lr1')).toBe('/es/dashboard/analysis');
  });

  it('falls back to the default locale when none is provided', () => {
    expect(extractRedirectTarget(0, '', 'lr1')).toBe('/en/dashboard/analysis');
    expect(extractRedirectTarget(2, '', 'lr1')).toBe('/en/dashboard/labs/review/lr1');
  });
});

describe('classifyExtractResponse — structured outcome (no silent swallow)', () => {
  it('classifies a 402 quota_exceeded body as the upgrade-dialog payload', () => {
    const out = classifyExtractResponse(402, quotaBody);
    expect(out.kind).toBe('quota');
    if (out.kind === 'quota') {
      expect(out.payload.limit).toBe(1);
      expect(out.payload.upgradeUrl).toBe('/en/pricing');
    }
  });

  it('classifies a successful extraction body as ok', () => {
    const out = classifyExtractResponse(200, { ok: true, pendingReview: 0, mapped: 3, unmapped: 0 });
    expect(out).toEqual({ kind: 'ok', pendingReview: 0, mapped: 3, unmapped: 0 });
  });

  it('detects a review-required success (pendingReview > 0) as ok, not as an error', () => {
    const out = classifyExtractResponse(200, { ok: true, pendingReview: 2, mapped: 1, unmapped: 1 });
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(out.pendingReview).toBe(2);
  });

  it('surfaces a structured server error message inline (retry/manual path)', () => {
    const out = classifyExtractResponse(500, { error: 'We couldn\'t read that lab file.' });
    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect(out.message).toContain('couldn\'t read');
  });

  it('returns a safe default message when the error body has no message', () => {
    const out = classifyExtractResponse(500, {});
    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect(out.message.length).toBeGreaterThan(0);
  });
});
