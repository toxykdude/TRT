/**
 * Pure orchestration helpers for the upload→extract→insight flow
 * (streamline-upload-to-insight / design.md "Sequence").
 *
 * Extracted as pure functions so the flow DECISIONS (redirect target, structured
 * error classification) are unit-testable in the node vitest environment without
 * a DOM. `upload-zone.tsx` (auto-extract) and `labs-list.tsx` (manual extract)
 * both consume them, giving parity in how 402/validation/server errors surface.
 */
import type { QuotaPayload } from '@/components/dashboard/quota-exceeded-dialog';

/**
 * Locale-prefixed route a successful extraction should progress to. Review-
 * required extractions open the confirmation surface for that report; otherwise
 * the user lands on analysis (spec §"Locale-safe progression").
 */
export function extractRedirectTarget(
  pendingReview: number,
  locale: string,
  labReportId: string,
): string {
  const loc = locale && locale.length > 0 ? locale : 'en';
  return pendingReview > 0
    ? `/${loc}/dashboard/labs/review/${labReportId}`
    : `/${loc}/dashboard/analysis`;
}

export type ExtractResponseOutcome =
  | { kind: 'ok'; pendingReview: number; mapped: number; unmapped: number }
  | { kind: 'quota'; payload: QuotaPayload }
  | { kind: 'error'; message: string };

function isQuotaPayload(body: unknown): body is QuotaPayload {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { error?: unknown }).error === 'quota_exceeded'
  );
}

function readErrorMessage(body: unknown): string | null {
  if (typeof body === 'object' && body !== null) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === 'string' && err.length > 0) return err;
  }
  return null;
}

/**
 * Classify a raw extract fetch (HTTP status + parsed body) into a structured,
 * actionable outcome. 402 → upgrade dialog; 2xx → ok (drives the redirect
 * target); anything else → an inline message (retry / manual entry). Never
 * returns null/undefined so callers can never silently swallow a failure.
 */
export function classifyExtractResponse(status: number, body: unknown): ExtractResponseOutcome {
  if (status === 402 && isQuotaPayload(body)) {
    return { kind: 'quota', payload: body };
  }
  if (
    status >= 200 &&
    status < 300 &&
    typeof body === 'object' &&
    body !== null &&
    'pendingReview' in body
  ) {
    const b = body as { pendingReview: number; mapped?: number; unmapped?: number };
    return {
      kind: 'ok',
      pendingReview: b.pendingReview,
      mapped: b.mapped ?? 0,
      unmapped: b.unmapped ?? 0,
    };
  }
  return {
    kind: 'error',
    message:
      readErrorMessage(body) ??
      'Extraction failed. You can retry or enter values manually.',
  };
}
