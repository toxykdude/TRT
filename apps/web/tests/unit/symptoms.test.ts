/**
 * Symptom set + score→visual encode helpers (GOLD §5.10 / spec TC-5, SE-1).
 *
 * The fixed symptom set is the app-layer validation source (the DB column is a
 * free String). Score→radius/opacity encode magnitude WITHOUT relying on color
 * alone (WCAG AA), since dot size + opacity carry the ordinal magnitude.
 */
import { describe, it, expect } from 'vitest';
import {
  SYMPTOM_SET,
  isKnownSymptom,
  scoreRadius,
  scoreOpacity,
} from '@/lib/symptoms';

describe('SYMPTOM_SET + isKnownSymptom (GOLD §5.10)', () => {
  it('exposes exactly the fixed GOLD §5.10 symptom set', () => {
    expect(SYMPTOM_SET).toEqual(['energy', 'mood', 'libido', 'sleep', 'recovery']);
  });

  it('isKnownSymptom is true for every member of the set', () => {
    for (const s of SYMPTOM_SET) expect(isKnownSymptom(s)).toBe(true);
  });

  it('isKnownSymptom is false for a value outside the set', () => {
    expect(isKnownSymptom('hair_loss')).toBe(false);
    expect(isKnownSymptom('')).toBe(false);
    expect(isKnownSymptom('Energy')).toBe(false); // case-sensitive machine keys
  });
});

describe('scoreRadius — 0..10 ordinal → 3..9px (monotonic, AA-safe)', () => {
  it('maps the endpoints to the [3,9] band', () => {
    expect(scoreRadius(0)).toBe(3);
    expect(scoreRadius(10)).toBe(9);
  });

  it('is monotonically increasing across the full range', () => {
    for (let i = 0; i < 10; i++) {
      expect(scoreRadius(i)).toBeLessThan(scoreRadius(i + 1));
    }
  });

  it('never leaves the [3,9] band for valid scores', () => {
    for (let i = 0; i <= 10; i++) {
      const r = scoreRadius(i);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(9);
    }
  });
});

describe('scoreOpacity — 0..10 ordinal → 0.3..1.0 (monotonic)', () => {
  it('maps the endpoints to the [0.3,1.0] band', () => {
    expect(scoreOpacity(0)).toBeCloseTo(0.3, 5);
    expect(scoreOpacity(10)).toBeCloseTo(1.0, 5);
  });

  it('is monotonically increasing across the full range', () => {
    for (let i = 0; i < 10; i++) {
      expect(scoreOpacity(i)).toBeLessThanOrEqual(scoreOpacity(i + 1));
    }
  });

  it('never leaves the [0.3,1.0] band for valid scores', () => {
    for (let i = 0; i <= 10; i++) {
      const o = scoreOpacity(i);
      expect(o).toBeGreaterThanOrEqual(0.3);
      expect(o).toBeLessThanOrEqual(1.0);
    }
  });
});

describe('score encode rejects invalid scores (defense-in-depth)', () => {
  it('rejects a negative score', () => {
    expect(() => scoreRadius(-1)).toThrow();
    expect(() => scoreOpacity(-1)).toThrow();
  });

  it('rejects a score above 10', () => {
    expect(() => scoreRadius(11)).toThrow();
    expect(() => scoreOpacity(11)).toThrow();
  });

  it('rejects a non-integer score', () => {
    expect(() => scoreRadius(4.5)).toThrow();
    expect(() => scoreOpacity(4.5)).toThrow();
  });
});
