/**
 * Symptom set + score→visual encode helpers (GOLD §5.10 / spec TC-5, SE-1).
 *
 * The DB `SymptomEntry.symptom` column is a free `String`, so the fixed §5.10
 * set is enforced at the application layer. This module is the single source
 * the route validators, the entry form dropdown, and the timeline reuse.
 *
 * Score magnitude on the analytics chart is encoded by dot RADIUS + OPACITY
 * (not color alone — WCAG AA, spec TC-5): a higher 0–10 score renders as a
 * larger, more opaque dot so magnitude is legible without depending on hue.
 */

/** Fixed symptom set (GOLD §5.10: Energy, Mood, Libido, Sleep, Recovery). */
export const SYMPTOM_SET = ['energy', 'mood', 'libido', 'sleep', 'recovery'] as const;

/** A valid symptom machine key. */
export type Symptom = (typeof SYMPTOM_SET)[number];

/** True only for an exact member of the fixed §5.10 set (case-sensitive). */
export function isKnownSymptom(symptom: string): boolean {
  return (SYMPTOM_SET as readonly string[]).includes(symptom);
}

/**
 * Assert a score is an integer in the 0..10 ordinal band (GOLD §5.10).
 * Throws on anything else — these encode chart geometry, so an out-of-band
 * value is a programmer error (user input is rejected earlier at the route).
 */
export function assertValidScore(score: number): void {
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new RangeError(`score must be an integer 0..10, got ${String(score)}`);
  }
}

/** Map a 0..10 score to a dot radius in px, growing 3 → 9 (monotonic). */
export function scoreRadius(score: number): number {
  assertValidScore(score);
  return 3 + (score / 10) * 6;
}

/** Map a 0..10 score to a dot opacity, growing 0.3 → 1.0 (monotonic). */
export function scoreOpacity(score: number): number {
  assertValidScore(score);
  return 0.3 + (score / 10) * 0.7;
}
