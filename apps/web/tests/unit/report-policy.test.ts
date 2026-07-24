/**
 * Report safety policy (GOLD §2 / §2.4) — dosing gate + guardrail audit.
 *
 * Covers P0.1.d (dosing never computed for non-clinicians; fail-closed
 * consumer payloads) and P0.1.e (one guardrail-audit event per generation).
 */
import { describe, it, expect } from 'vitest';
import {
  isVerifiedClinician,
  decideReportPolicy,
  buildGuardrailAuditEvent,
} from '@/lib/report-policy';
import {
  persistGuardrailAudit,
  GuardrailViolationError,
  type GuardrailAuditEvent,
} from '@trt/guardrails';

describe('isVerifiedClinician (GOLD §2.4)', () => {
  it('true only for a CLINICIAN with a non-null licenseVerifiedAt', () => {
    expect(isVerifiedClinician('CLINICIAN', new Date())).toBe(true);
    expect(isVerifiedClinician('CLINICIAN', '2026-01-01')).toBe(true);
  });
  it('false for every other role or an unverified CLINICIAN', () => {
    expect(isVerifiedClinician('PATIENT', new Date())).toBe(false);
    expect(isVerifiedClinician('ADMIN', new Date())).toBe(false);
    expect(isVerifiedClinician('CLINICIAN', null)).toBe(false);
    expect(isVerifiedClinician('CLINICIAN', undefined)).toBe(false);
  });
});

// A realistic consumer report payload: biomarkers + trends + findings, no dosing.
// Lab units (ng/dL, pg/mL, nmol/L) are deliberately disjoint from dosing units
// (mg, mcg, IU) so this prose is consumer-safe by construction.
const CONSUMER_PAYLOAD = {
  sections: {
    executiveSummary:
      'This report summarizes 6 lab values. 2 values are outside the reference range. ' +
      'Discuss all findings with your healthcare provider.',
    hormoneTrends:
      'total testosterone: latest 412 ng/dL (low), trend flat. free testosterone: latest 68 pg/mL (normal).',
    cbcTrends: 'hematocrit: latest 52% (high).',
    redFlags: ['Hematocrit above the reference range; discuss with your physician.'],
    knowledgeBaseReferences: [
      'Endocrine Society Guideline on Testosterone Therapy: reference ranges are assay-specific.',
    ],
  },
  findings: [
    { biomarkerKey: 'hematocrit', message: 'Hematocrit above the reference range.' },
  ],
  dosingRecommendations: [], // never computed for a consumer
  chartData: {
    classified: [
      { biomarkerKey: 'total_testosterone', valueNumeric: 412, unit: 'ng/dL', status: 'LOW' },
      { biomarkerKey: 'hematocrit', valueNumeric: 52, unit: '%', status: 'HIGH' },
    ],
  },
};

const DOSING_PAYLOAD = {
  sections: {
    dosingRecommendations: [
      { compound: 'Testosterone Cypionate', dose: '200 mg weekly', frequency: 'every 7 days' },
    ],
  },
};

describe('decideReportPolicy — dosing never computed for non-clinicians', () => {
  it('PATIENT + clean payload: no dosing, audit pass, no findings', () => {
    const d = decideReportPolicy({ role: 'PATIENT', licenseVerifiedAt: null, payload: CONSUMER_PAYLOAD });
    expect(d.canComputeDosing).toBe(false);
    expect(d.auditAction).toBe('pass');
    expect(d.findings).toHaveLength(0);
  });

  it('unverified CLINICIAN is treated as a consumer (no dosing)', () => {
    const d = decideReportPolicy({
      role: 'CLINICIAN',
      licenseVerifiedAt: null,
      payload: CONSUMER_PAYLOAD,
    });
    expect(d.canComputeDosing).toBe(false);
  });

  it('ADMIN is treated as a consumer (no dosing)', () => {
    const d = decideReportPolicy({ role: 'ADMIN', licenseVerifiedAt: null, payload: CONSUMER_PAYLOAD });
    expect(d.canComputeDosing).toBe(false);
  });

  it('PATIENT payload with ANY dosing key fails closed (throws)', () => {
    expect(() =>
      decideReportPolicy({ role: 'PATIENT', licenseVerifiedAt: null, payload: DOSING_PAYLOAD }),
    ).toThrow(GuardrailViolationError);
  });

  it('unverified CLINICIAN payload with dosing fails closed (throws)', () => {
    expect(() =>
      decideReportPolicy({ role: 'CLINICIAN', licenseVerifiedAt: null, payload: DOSING_PAYLOAD }),
    ).toThrow(GuardrailViolationError);
  });

  it('PATIENT payload with a dosing compound string fails closed (throws)', () => {
    const payload = {
      sections: { note: 'Start anastrozole 0.5 mg twice a week for elevated estradiol.' },
      dosingRecommendations: [],
    };
    expect(() =>
      decideReportPolicy({ role: 'PATIENT', licenseVerifiedAt: null, payload }),
    ).toThrow(GuardrailViolationError);
  });
});

describe('decideReportPolicy — verified CLINICIAN may receive dosing', () => {
  it('verified CLINICIAN + dosing payload: dosing allowed, audit pass', () => {
    const d = decideReportPolicy({
      role: 'CLINICIAN',
      licenseVerifiedAt: new Date(),
      payload: DOSING_PAYLOAD,
    });
    expect(d.canComputeDosing).toBe(true);
    expect(d.auditAction).toBe('pass'); // permitted passthrough
    expect(d.findings.length).toBeGreaterThan(0); // dosing content present
  });

  it('verified CLINICIAN + clean payload: dosing allowed, no findings', () => {
    const d = decideReportPolicy({
      role: 'CLINICIAN',
      licenseVerifiedAt: new Date(),
      payload: CONSUMER_PAYLOAD,
    });
    expect(d.canComputeDosing).toBe(true);
    expect(d.auditAction).toBe('pass');
    expect(d.findings).toHaveLength(0);
  });
});

describe('buildGuardrailAuditEvent + persistGuardrailAudit (P0.1.e)', () => {
  it('builds the audit event shape persisted as one AuditLog row', () => {
    const event = buildGuardrailAuditEvent({
      userId: 'u1',
      role: 'PATIENT',
      reportId: 'r1',
      findingsCount: 0,
      action: 'pass',
      engineVersion: 'sha256:abc',
    });
    expect(event.userId).toBe('u1');
    expect(event.role).toBe('PATIENT');
    expect(event.reportId).toBe('r1');
    expect(event.findingsCount).toBe(0);
    expect(event.action).toBe('pass');
    expect(event.engineVersion).toBe('sha256:abc');
  });

  it('persistGuardrailAudit invokes the writer exactly once with the event', async () => {
    const calls: GuardrailAuditEvent[] = [];
    await persistGuardrailAudit(
      async (e) => {
        calls.push(e);
      },
      buildGuardrailAuditEvent({
        userId: 'u1',
        role: 'CLINICIAN',
        reportId: 'r9',
        findingsCount: 2,
        action: 'pass',
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.reportId).toBe('r9');
    expect(calls[0]!.action).toBe('pass');
  });
});
