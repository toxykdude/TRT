/**
 * Canonical clinical guardrails (GOLD §2.3–§2.5).
 *
 * Single implementation for the whole workspace — `packages/engine` and
 * `packages/ai` re-export from here. Restores the safety posture per
 * `develop_saas.md` P0.1.b: dosing/schedule/prescription/start-stop-change/
 * diagnosis content is detected across ALL compound families, redacted for
 * consumer roles, passed through only for license-verified clinicians, and
 * consumer-bound payloads fail closed via {@link assertConsumerSafe}.
 */
import { RULES, compoundIn, isAllowlisted, type RuleCategory } from './rules';

export type GuardrailRole = 'PATIENT' | 'CLINICIAN' | 'ADMIN';

/**
 * The mandatory report disclaimer (GOLD §2.5). Required in every report
 * payload — schema validation fails without it — and rendered
 * non-dismissibly on every clinical surface.
 */
export const REPORT_DISCLAIMER =
  'This report is informational and educational only. It is not medical advice, ' +
  'does not diagnose or treat any condition, and is not a substitute for ' +
  'consultation with a qualified physician. Discuss all findings with your ' +
  'healthcare provider.';

export type GuardrailFinding = {
  ruleId: string;
  category: RuleCategory;
  /** matched snippet (trimmed) */
  match: string;
  /** character offset in the scanned text */
  index: number;
  /** compound family key when the match involves a known compound */
  compound?: string;
};

/** Backward-compatible result shape (used across engine/ai/mcp). */
export type GuardrailResult = {
  ok: boolean;
  reasons: string[];
  blocked: string[];
  findings: GuardrailFinding[];
};

/**
 * Scan text for dosing/schedule/prescription/start-stop-change/diagnosis
 * content. Allowlisted historical-record contexts are skipped (with the W4
 * anti-gaming guard).
 */
export function scanForDosing(text: string): GuardrailFinding[] {
  if (!text) return [];
  const findings: GuardrailFinding[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      const match = m[0];
      if (match.trim().length === 0) continue;
      if (isAllowlisted(text, m.index, match.length)) continue;
      findings.push({
        ruleId: rule.id,
        category: rule.category,
        match: match.trim().slice(0, 200),
        index: m.index,
        compound: compoundIn(match),
      });
      // Avoid pathological backtracking on overlapping global matches.
      if (rule.pattern.lastIndex === m.index) rule.pattern.lastIndex += 1;
    }
  }
  return findings.sort((a, b) => a.index - b.index);
}

/**
 * Enforce clinical guardrails on a piece of text. `ok` is true when no
 * findings fire. Kept for backward compatibility with existing pipelines.
 */
export function enforceGuardrails(text: string): GuardrailResult {
  const findings = scanForDosing(text);
  return {
    ok: findings.length === 0,
    reasons: findings.map((f) => `${f.ruleId}: ${f.match.slice(0, 80)}`),
    blocked: findings.map((f) => f.match),
    findings,
  };
}

const REDACTION = '[dosing content removed — discuss with your physician]';

/**
 * Redact dosing content by role. Only a CLINICIAN with a verified license
 * (GOLD §2.4) receives the text unchanged; every other role gets redactions.
 */
export function redactDosing(
  text: string,
  role: GuardrailRole,
  opts?: { clinicianVerified?: boolean },
): string {
  if (role === 'CLINICIAN' && opts?.clinicianVerified === true) return text;
  const findings = scanForDosing(text);
  if (findings.length === 0) return text;
  // Redact from the end so offsets stay valid.
  let out = text;
  for (const f of [...findings].sort((a, b) => b.index - a.index)) {
    out = out.slice(0, f.index) + REDACTION + out.slice(f.index + f.match.length);
  }
  return out;
}

/** Error thrown when a consumer-bound payload contains dosing content. */
export class GuardrailViolationError extends Error {
  readonly findings: GuardrailFinding[];
  constructor(findings: GuardrailFinding[]) {
    super(
      `Consumer-bound payload contains ${findings.length} prohibited dosing/clinical finding(s) ` +
        `(GOLD §2.3): ${findings
          .slice(0, 3)
          .map((f) => `${f.ruleId}("${f.match.slice(0, 40)}")`)
          .join(', ')}`,
    );
    this.name = 'GuardrailViolationError';
    this.findings = findings;
  }
}

/**
 * Fail-closed guard for consumer-bound payloads (GOLD §2.3, P0.1.b/d).
 * Serializes the payload and throws {@link GuardrailViolationError} if any
 * dosing/clinical content is detected. Call this on the final report payload
 * for every non-verified-clinician role — never bypass it.
 */
export function assertConsumerSafe(payload: unknown): void {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const findings = scanForDosing(text);
  if (findings.length > 0) throw new GuardrailViolationError(findings);
}

/**
 * Response for dosing questions directed at consumers (GOLD §2.3):
 * refuse, redirect to the physician, and stay educational.
 */
export function refuseAndRedirect(userRequest: string): string {
  return (
    `I can't provide dosing, cycle, or protocol guidance (received: "${userRequest.slice(0, 80)}"). ` +
    'That kind of decision has to come from your physician, who knows your full history. ' +
    'What I can do: organize your labs, show trends against your lab-specific reference ranges, ' +
    'and prepare questions for your next appointment.'
  );
}

// ── Audit persistence (P0.1.e) ───────────────────────────────────────────────

export type GuardrailAuditAction = 'pass' | 'redact' | 'block';

export type GuardrailAuditEvent = {
  userId: string;
  role: GuardrailRole | string;
  reportId?: string | null;
  findingsCount: number;
  action: GuardrailAuditAction;
  /** engine hash / version for reproducibility */
  engineVersion?: string | null;
  kbVersion?: string | null;
  detail?: Record<string, unknown>;
};

/** Injected persistence callback — keeps this package framework-free. */
export type GuardrailAuditWriter = (event: GuardrailAuditEvent) => Promise<void> | void;

/**
 * Persist one guardrail audit outcome via the injected writer. Called from
 * report routes so every report generation leaves exactly one audit row.
 */
export async function persistGuardrailAudit(
  write: GuardrailAuditWriter,
  event: GuardrailAuditEvent,
): Promise<void> {
  await write(event);
}

/** Summarize a scan result into the standard audit payload shape. */
export function summarizeFindings(findings: GuardrailFinding[]): Record<string, unknown> {
  const byRule = new Map<string, number>();
  for (const f of findings) byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1);
  return {
    findingsCount: findings.length,
    byRule: Object.fromEntries(byRule),
    compounds: [...new Set(findings.map((f) => f.compound).filter(Boolean))],
  };
}
