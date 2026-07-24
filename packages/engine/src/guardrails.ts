/**
 * Re-export of the canonical guardrail implementation (GOLD §2).
 *
 * The single implementation lives in `@trt/guardrails` (develop_saas.md
 * P0.1.b — exactly one guardrail module in the workspace). This module
 * exists only so historical import paths keep working.
 */
export {
  scanForDosing,
  enforceGuardrails,
  redactDosing,
  assertConsumerSafe,
  refuseAndRedirect,
  REPORT_DISCLAIMER,
  GuardrailViolationError,
  type GuardrailRole,
  type GuardrailFinding,
  type GuardrailResult,
} from '@trt/guardrails';
