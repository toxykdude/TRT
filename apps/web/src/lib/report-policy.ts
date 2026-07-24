/**
 * Report safety policy (GOLD §2 / §2.4 — Prime Directive).
 *
 * The dosing/protocol reference module is computed ONLY for a CLINICIAN whose
 * license is verified (licenseVerifiedAt != null). For every other role the
 * dosing section is never computed (kept as the engine's empty `[]`), and the
 * final consumer payload is fail-closed audited via assertConsumerSafe.
 *
 * These helpers are pure so the safety contract is unit-testable without a
 * running server. The report route (reports/generate/route.ts) wires them in;
 * the dashboard UI re-gates by a verified-clinician flag for defense-in-depth.
 */
import {
  assertConsumerSafe,
  scanForDosing,
  type GuardrailAuditAction,
  type GuardrailAuditEvent,
  type GuardrailFinding,
  type GuardrailRole,
} from '@trt/guardrails';

export type ViewerRole = GuardrailRole | string;

/**
 * GOLD §2.4 — true only for a CLINICIAN with a non-null licenseVerifiedAt.
 * Every other role (PATIENT, ADMIN, *unverified* CLINICIAN, or a missing/unknown
 * role) is treated as a consumer: dosing is never computed for them.
 */
export function isVerifiedClinician(
  role: ViewerRole | undefined,
  licenseVerifiedAt: Date | string | null | undefined,
): boolean {
  return role === 'CLINICIAN' && licenseVerifiedAt != null;
}

export type ReportPolicyDecision = {
  /** Whether dosing may be computed for this viewer. */
  canComputeDosing: boolean;
  /** Guardrail audit action to record for this generation. */
  auditAction: GuardrailAuditAction;
  /** Dosing findings in the final payload (for the audit summary). */
  findings: GuardrailFinding[];
};

/**
 * Decide dosing eligibility + the guardrail audit action for a final report
 * payload, and fail closed (throw GuardrailViolationError) if a consumer-bound
 * payload carries any dosing content.
 *
 * Pure w.r.t. inputs; the only side effect is the fail-closed throw, which is
 * the safety contract itself.
 */
export function decideReportPolicy(args: {
  role: ViewerRole;
  licenseVerifiedAt: Date | string | null | undefined;
  payload: unknown;
}): ReportPolicyDecision {
  const canComputeDosing = isVerifiedClinician(args.role, args.licenseVerifiedAt);
  const text =
    typeof args.payload === 'string' ? args.payload : JSON.stringify(args.payload);
  const findings = scanForDosing(text);

  // Consumer (non-verified-clinician) payloads MUST fail closed.
  if (!canComputeDosing) assertConsumerSafe(args.payload);

  const auditAction: GuardrailAuditAction =
    findings.length === 0 ? 'pass' : canComputeDosing ? 'pass' : 'block';

  return { canComputeDosing, auditAction, findings };
}

/**
 * Build the GuardrailAuditEvent recorded as one AuditLog row per report
 * generation (P0.1.e). Pure: given the inputs it returns the event the route
 * persists via persistGuardrailAudit.
 */
export function buildGuardrailAuditEvent(args: {
  userId: string;
  role: ViewerRole;
  reportId: string;
  findingsCount: number;
  action: GuardrailAuditAction;
  engineVersion?: string | null;
  kbVersion?: string | null;
  detail?: Record<string, unknown>;
}): GuardrailAuditEvent {
  return {
    userId: args.userId,
    role: args.role as GuardrailRole,
    reportId: args.reportId,
    findingsCount: args.findingsCount,
    action: args.action,
    engineVersion: args.engineVersion ?? null,
    kbVersion: args.kbVersion ?? null,
    detail: args.detail,
  };
}
