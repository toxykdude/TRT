/**
 * Labs-list extract-error surfacing logic (streamline-upload-to-insight §2.3).
 *
 * The manual "Extract" button previously caught every error silently and forced
 * a full `window.location.reload()`, so a 402/500/404 looked like "the button
 * does nothing". The fix surfaces a STRUCTURED outcome (402 → upgrade dialog;
 * other → inline message) and refreshes via the router. The decision logic is
 * the SAME pure classifier used by the auto-extract upload-zone, tested here
 * against the labs-list perspective to pin the no-silent-swallow contract.
 *
 * Test-layer note: same as upload-zone.test.ts — `node` env, no DOM, so the
 * classifier is unit-tested directly (`.test.ts`); component wiring (dialog +
 * `router.refresh()` instead of `window.location.reload()`) is verified by
 * typecheck + manual Playwright.
 */
import { describe, it, expect } from 'vitest';
import { classifyExtractResponse } from '@/lib/extract-flow';
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

describe('labs-list extract surfacing — structured, never silent', () => {
  it('classifies a 402 so the list can open the upgrade dialog (not a silent reload)', () => {
    const out = classifyExtractResponse(402, quotaBody);
    expect(out.kind).toBe('quota');
    if (out.kind === 'quota') expect(out.payload.error).toBe('quota_exceeded');
  });

  it('surfaces a structured message for a generic server error (not swallowed)', () => {
    const out = classifyExtractResponse(500, { error: 'boom' });
    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect(out.message).toBe('boom');
  });

  it('returns a safe default message when the server gives no body', () => {
    const out = classifyExtractResponse(500, null);
    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect(out.message.length).toBeGreaterThan(0);
  });

  it('treats a successful manual extract as ok so the list can router.refresh()', () => {
    const out = classifyExtractResponse(200, { ok: true, pendingReview: 0, mapped: 4, unmapped: 0 });
    expect(out.kind).toBe('ok');
  });

  it('never produces an empty/undefined outcome for any status', () => {
    for (const status of [400, 404, 409, 422, 500, 502, 503]) {
      const out = classifyExtractResponse(status, { error: 'x' });
      expect(out.kind).not.toBe('ok');
      // Every non-ok outcome is actionable: quota (dialog) or error (message).
      if (out.kind === 'error') expect(out.message.length).toBeGreaterThan(0);
    }
  });
});
