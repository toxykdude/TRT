/**
 * @trt/guardrails — the single canonical guardrail implementation (GOLD §2).
 *
 * Re-exported by `@trt/engine` and `@trt/ai`; no dosing-detection regex may
 * exist anywhere else in the workspace (grep-enforceable per
 * `develop_saas.md` P0.1.b).
 */
export {
  scanForDosing,
  enforceGuardrails,
  redactDosing,
  assertConsumerSafe,
  refuseAndRedirect,
  persistGuardrailAudit,
  summarizeFindings,
  REPORT_DISCLAIMER,
  GuardrailViolationError,
  type GuardrailRole,
  type GuardrailFinding,
  type GuardrailResult,
  type GuardrailAuditAction,
  type GuardrailAuditEvent,
  type GuardrailAuditWriter,
} from './guardrails';

export {
  RULES,
  COMPOUND_FAMILIES,
  COMPOUND_PATTERN,
  compoundIn,
  isAllowlisted,
  type GuardrailRule,
  type RuleCategory,
  type CompoundFamily,
} from './rules';
