/**
 * Review surface pure helpers (spec Req 4 / design.md §"Confirmation surface").
 *
 * Each uncertain, low-confidence, or unmapped value (reviewStatus PENDING_REVIEW)
 * surfaces on the review page with its biomarker name, printed value, unit, and
 * the REASON it landed in review. These pure helpers shape the DB rows into the
 * view model the `<ReviewForm>` renders; the page wiring (owner-scoped query +
 * non-dismissible disclaimer) lives in the Server Component and is verified by
 * typecheck + manual Playwright (this repo's vitest has no jsdom).
 */
import { EXTRACTION_CONFIDENCE_THRESHOLD } from '@trt/ai';

/** Why a value is pending review. Drives the surfaced copy + the form affordance. */
export type ReviewReason = 'unmapped' | 'low_confidence';

/** A single review-required row projected for the review surface. */
export type ReviewRow = {
  labResultId: string;
  /** Canonical biomarker name when mapped; the printed name when unmapped. */
  name: string;
  /** Printed value (or "—" when the extraction couldn't read one). */
  value: string;
  /** Printed unit (or "—" when absent). */
  unit: string;
  /** The per-lab reference range exactly as printed (GOLD §5.7). */
  refText: string;
  reason: ReviewReason;
};

type ReviewDbRow = {
  id: string;
  biomarkerId: string | null;
  rawName: string | null;
  rawValue: string | null;
  rawUnit: string | null;
  rawRefLow: string | null;
  rawRefHigh: string | null;
  rawRefText: string | null;
  confidence: number | null;
  unit: string | null;
};

type ReviewBiomarker = {
  key: string | null;
  name: string | null;
  canonicalUnit: string | null;
} | null;

/**
 * Project one DB row into a review view model. The reason is content-independent
 * of the value: an unmapped biomarker (biomarkerId null) is always 'unmapped';
 * a mapped value below the confidence threshold is always 'low_confidence'.
 */
export function toReviewRow(
  row: ReviewDbRow,
  biomarker: ReviewBiomarker,
  threshold: number = EXTRACTION_CONFIDENCE_THRESHOLD,
): ReviewRow {
  const isUnmapped = row.biomarkerId == null;
  const reason: ReviewReason = isUnmapped ? 'unmapped' : 'low_confidence';

  return {
    labResultId: row.id,
    name: biomarker?.name ?? row.rawName ?? '—',
    value: row.rawValue ?? '—',
    unit: row.rawUnit ?? '—',
    refText: formatRefText(row),
    reason,
  };
}

/**
 * Shape the owner-scoped PENDING_REVIEW rows (with their biomarker included)
 * into the list the review surface renders. The page is responsible for the
 * owner-scoped query (where: { labReportId, ownerId, reviewStatus }).
 */
export function buildReviewRows(
  rows: Array<ReviewDbRow & { biomarker: ReviewBiomarker }>,
  threshold?: number,
): ReviewRow[] {
  return rows.map((r) => toReviewRow(r, r.biomarker, threshold));
}

/** Render the per-lab reference range exactly as printed, or "—". */
function formatRefText(row: ReviewDbRow): string {
  if (row.rawRefText && row.rawRefText.trim() !== '') return row.rawRefText;
  const low = row.rawRefLow;
  const high = row.rawRefHigh;
  if (low != null || high != null) {
    const unit = row.rawUnit ? ` ${row.rawUnit}` : '';
    return `${low ?? ''} - ${high ?? ''}${unit}`.trim();
  }
  return '—';
}
