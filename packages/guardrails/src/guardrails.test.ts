/**
 * Canonical guardrail tests (GOLD §2.3, develop_saas.md P0.1.b).
 *
 * Acceptance criteria covered here:
 *  - For each compound family, a dosing sentence is detected, redacted for
 *    PATIENT role, and passed through for a verified CLINICIAN role.
 *  - A consumer payload containing any dosing string fails closed.
 *  - Allowlist works for genuine historical records and cannot be gamed (W4).
 *  - Benign trend/classification prose passes.
 */
import { describe, it, expect } from 'vitest';
import {
  scanForDosing,
  enforceGuardrails,
  redactDosing,
  assertConsumerSafe,
  refuseAndRedirect,
  GuardrailViolationError,
} from './guardrails';
import { COMPOUND_FAMILIES } from './rules';

// ── Per-compound detection matrix ────────────────────────────────────────────

const DOSING_SENTENCES: Array<{ family: string; sentence: string }> = [
  { family: 'testosterone', sentence: 'Recommend 200 mg of testosterone cypionate weekly.' },
  { family: 'testosterone', sentence: 'Run 200mg test cypionate every 7 days.' },
  { family: 'nandrolone', sentence: 'Use 200mg nandrolone decanoate every week.' },
  { family: 'trenbolone', sentence: '100mg trenbolone acetate EOD for 8 weeks.' },
  { family: 'boldenone', sentence: 'Take 400 mg boldenone undecylenate per week.' },
  { family: 'masteron', sentence: 'Add 300 mg masteron propionate weekly.' },
  { family: 'primobolan', sentence: 'Run primobolan at 400 mg weekly.' },
  { family: 'oxandrolone', sentence: 'Take 50 mg oxandrolone daily.' },
  { family: 'dianabol', sentence: 'Start dianabol 30 mg per day.' },
  { family: 'winstrol', sentence: 'Use winstrol 50 mg daily for the final 6 weeks.' },
  { family: 'sarms', sentence: 'Take 20 mg ostarine every day.' },
  { family: 'clomiphene', sentence: 'PCT: clomiphene 50 mg daily for 4 weeks.' },
  { family: 'tamoxifen', sentence: 'Take 20 mg tamoxifen daily.' },
  { family: 'clenbuterol', sentence: 'Ramp clenbuterol to 80 mcg per day.' },
  { family: 'hcg', sentence: 'Add 500 IU of hCG twice weekly.' },
  { family: 'aromatase_inhibitors', sentence: 'Start anastrozole 0.5 mg twice a week.' },
];

describe('scanForDosing — one dosing sentence per compound family', () => {
  for (const { family, sentence } of DOSING_SENTENCES) {
    it(`detects ${family} dosing: "${sentence}"`, () => {
      const findings = scanForDosing(sentence);
      expect(findings.length).toBeGreaterThan(0);
    });
  }

  it('covers every compound family in the table with at least one test sentence', () => {
    const tested = new Set(DOSING_SENTENCES.map((d) => d.family));
    for (const fam of COMPOUND_FAMILIES) {
      expect(tested.has(fam.key), `missing dosing test for ${fam.key}`).toBe(true);
    }
  });
});

// ── Redaction by role ────────────────────────────────────────────────────────

describe('redactDosing — role behavior', () => {
  for (const { family, sentence } of DOSING_SENTENCES) {
    it(`redacts ${family} dosing for PATIENT role`, () => {
      const redacted = redactDosing(sentence, 'PATIENT');
      expect(redacted).not.toBe(sentence);
      expect(redacted).toContain('discuss with your physician');
    });
  }

  it('redacts for unverified CLINICIAN (treated as consumer)', () => {
    const s = 'Recommend 200 mg of testosterone cypionate weekly.';
    expect(redactDosing(s, 'CLINICIAN')).not.toBe(s);
    expect(redactDosing(s, 'CLINICIAN', { clinicianVerified: false })).not.toBe(s);
  });

  it('passes through for verified CLINICIAN', () => {
    const s = 'Recommend 200 mg of testosterone cypionate weekly.';
    expect(redactDosing(s, 'CLINICIAN', { clinicianVerified: true })).toBe(s);
  });

  it('redacts for ADMIN (no clinical privilege by default)', () => {
    const s = 'Take 50 mg oxandrolone daily.';
    expect(redactDosing(s, 'ADMIN')).not.toBe(s);
  });

  it('leaves clean text untouched for any role', () => {
    const s = 'Your hematocrit is above the reference range; discuss with your physician.';
    expect(redactDosing(s, 'PATIENT')).toBe(s);
  });
});

// ── Fail-closed consumer payloads ────────────────────────────────────────────

describe('assertConsumerSafe — fail closed', () => {
  it('throws on a report payload containing a dosing string', () => {
    const payload = {
      sections: {
        executiveSummary: 'Values reviewed.',
        dosingRecommendations: [{ compound: 'Testosterone Cypionate', dose: '200 mg weekly' }],
      },
    };
    expect(() => assertConsumerSafe(payload)).toThrow(GuardrailViolationError);
  });

  it('throws on complete cycle protocol text', () => {
    const cycle =
      'Week 1-12: Testosterone Cypionate 500mg/week, Nandrolone Decanoate 300mg/week, ' +
      'Anastrozole 0.5mg E3D, hCG 500IU 2x/week. PCT: Clomid 50mg/day for 4 weeks.';
    expect(() => assertConsumerSafe({ text: cycle })).toThrow(GuardrailViolationError);
  });

  it('exposes findings on the thrown error', () => {
    try {
      assertConsumerSafe('Use 200mg nandrolone decanoate every week.');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GuardrailViolationError);
      expect((e as GuardrailViolationError).findings.length).toBeGreaterThan(0);
    }
  });

  it('passes a clean educational payload', () => {
    expect(() =>
      assertConsumerSafe({
        sections: { executiveSummary: 'Two values are outside the reference range.' },
      }),
    ).not.toThrow();
  });
});

// ── Must-pass (benign) cases ─────────────────────────────────────────────────

describe('enforceGuardrails — benign clinical prose passes', () => {
  const BENIGN = [
    'Your total testosterone trended from 380 to 412 ng/dL over six months.',
    'Estradiol (sensitive) is 35 pg/mL, within the reference range of 10.0 - 40.0 pg/mL.',
    'Hematocrit is above the reference range; this is commonly monitored during TRT. Discuss with your physician.',
    'SHBG of 52 nmol/L sits near the top of the 16.5 - 55.9 nmol/L band.',
    'This summary is educational and organizational; it does not diagnose or prescribe.',
    'Your free testosterone of 68 pg/mL is within range (47.0 - 244.0 pg/mL).',
    'Consider asking your physician whether a thyroid panel would be useful.',
  ];
  for (const text of BENIGN) {
    it(`passes: "${text.slice(0, 60)}..."`, () => {
      const r = enforceGuardrails(text);
      expect(r.ok, r.reasons.join('; ')).toBe(true);
      expect(r.findings).toHaveLength(0);
    });
  }
});

// ── Must-block cases (beyond the compound matrix) ────────────────────────────

describe('enforceGuardrails — prohibited content is blocked', () => {
  const PROHIBITED = [
    'Increase to 150mg weekly and titrate from there.',
    'I recommend 250mg testosterone enanthate every 7 days.',
    'You should start testosterone and increase the dose to 200mg.',
    'You may have hypogonadism based on these labs.',
    'You have low T and are hypogonadal.',
    'These results are consistent with a diagnosis of secondary hypogonadism.',
    'You could take 100mg testosterone weekly.',
    'Try taking 0.5mg anastrozole twice a week.',
    'Stop anastrozole and switch to exemestane 12.5 mg twice a week.',
    'Prescribe 200 mg testosterone cypionate weekly.',
  ];
  for (const text of PROHIBITED) {
    it(`blocks: "${text.slice(0, 60)}..."`, () => {
      const r = enforceGuardrails(text);
      expect(r.ok).toBe(false);
      expect(r.blocked.length).toBeGreaterThan(0);
      expect(r.reasons.length).toBeGreaterThan(0);
    });
  }
});

// ── Allowlist behavior (with W4 anti-gaming) ─────────────────────────────────

describe('allowlist — historical record context', () => {
  it('allows genuine historical record mentions', () => {
    const r = enforceGuardrails(
      'Medication history: previously prescribed 200 mg testosterone cypionate weekly by Dr. Smith in 2023.',
    );
    expect(r.ok).toBe(true);
  });

  it('NEVER allowlists when prescriptive phrasing co-occurs (W4)', () => {
    const r = enforceGuardrails(
      'Historically, you should take 200 mg of testosterone cypionate weekly.',
    );
    expect(r.ok).toBe(false);
  });

  it('does not allowlist dosing without historical context', () => {
    const r = enforceGuardrails('Take 200 mg testosterone cypionate weekly.');
    expect(r.ok).toBe(false);
  });
});

// ── refuseAndRedirect ────────────────────────────────────────────────────────

describe('refuseAndRedirect', () => {
  it('refuses and redirects to the physician', () => {
    const msg = refuseAndRedirect('what dose of tren should I run');
    expect(msg).toContain("can't provide");
    expect(msg).toContain('physician');
    // The refusal itself must pass the guardrail filter.
    expect(enforceGuardrails(msg).ok).toBe(true);
  });
});

describe('REPORT_DISCLAIMER (GOLD §2.5)', () => {
  it('is non-empty and itself passes the guardrail filter', async () => {
    const { REPORT_DISCLAIMER } = await import('./guardrails');
    expect(REPORT_DISCLAIMER.length).toBeGreaterThan(40);
    expect(enforceGuardrails(REPORT_DISCLAIMER).ok).toBe(true);
  });
});
