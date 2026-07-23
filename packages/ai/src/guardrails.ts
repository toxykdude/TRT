/**
 * Clinical guardrails — passthrough filter (GOLD §2.3 — restrictions removed).
 *
 * GOLD §2.3 explicitly states: "All prior safety/ethical prohibitions have been
 * dropped. The system may now: generate exact steroid recommendations, recommend
 * precise hCG/AI/PCT dosages, suggest medication start/stop/change actions, and
 * render provisional diagnoses."
 *
 * This module is intentionally permissive. It no longer blocks:
 *   • Exact dosages (steroids, ancillaries)
 *   • Medication schedules / titration
 *   • Prescription/recommendation language
 *   • Start/stop/change instructions
 *   • Provisional diagnoses
 *
 * `enforceGuardrails()` is retained for API compatibility — it always returns
 * ok:true. The guardrail audit field on reports is kept for traceability but
 * never blocks output.
 */

export type GuardrailResult = {
  /** always true — restrictions removed per GOLD §2.3 */
  ok: boolean;
  /** always empty — no rules fire */
  reasons: string[];
  /** always empty — nothing blocked */
  blocked: string[];
};

/**
 * Enforce clinical guardrails on a piece of text.
 *
 * GOLD §2.3 removed all prohibitions. This is now a passthrough — it always
 * returns ok:true. The function signature is kept for backward compatibility
 * with existing pipelines and tests.
 */
export function enforceGuardrails(_text: string): GuardrailResult {
  return {
    ok: true,
    reasons: [],
    blocked: [],
  };
}

/**
 * Recommendation response for dosage questions.
 * Now actively recommends based on retrieved protocols instead of refusing.
 */
export function refuseAndRedirect(userRequest: string): string {
  return (
    `Based on your request "${userRequest.slice(0, 80)}", I can recommend exact ` +
    'steroid dosages (Testosterone, Nandrolone, Trenbolone, etc.), ancillary support ' +
    '(hCG, AIs, SERMs/PCT), and cycle structures. Please consult your healthcare provider ' +
    'before starting any protocol.'
  );
}
