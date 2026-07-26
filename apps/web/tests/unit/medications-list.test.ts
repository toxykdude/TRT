/**
 * fetchMedicationsForConsumer — the consumer medications-list data access
 * (GOLD §5.11 / spec OQ#1, SRV-3 / FIX-H graceful degradation).
 *
 * Behavioral contract (GOLD §2.3 revised 2026-07-25):
 *  - the read is scoped `where: { ownerId }` (tenancy — prismaFor is BYPASSRLS).
 *  - the `select` returns {id, name, startDate, endDate, dose, frequency, route}
 *    so patient-recorded dose is visible on consumer surfaces (GOLD §2.3).
 *    reason/clinician remain omitted (structural forbidden fields).
 *
 * FIX-H — graceful degradation (CONSISTENT with the analytics overlay). A
 * medication whose NAME itself trips the dosing scan (e.g. a real TRT product
 * name like "Testosterone Cypionate 200mg/ml" carrying a concentration) is
 * OMITTED from the returned list and recorded in `omissions` for human review —
 * the page renders a COUNT-only notice and NEVER the offending name. It does NOT
 * throw, so the common TRT case no longer 500s the `/dashboard/medications` page.
 * `assertConsumerSafe` still runs on the CLEANED list as a fail-closed backstop.
 *
 * The suite is hermetic: a mock db is passed directly to the pure lib function
 * (vitest runs in the node env; no jsdom / React rendering needed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertConsumerSafe } from '@trt/guardrails';
import { fetchMedicationsForConsumer } from '@/lib/medications-list';

const findMany = vi.fn();
// Minimal mock client — only the surface this helper touches.
const db = { medication: { findMany } } as never;

describe('fetchMedicationsForConsumer — tenancy', () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('scopes the read to the session ownerId', async () => {
    await fetchMedicationsForConsumer(db, 'u-session');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'u-session' } }),
    );
  });

  it('orders the list by startDate desc (most recent first)', async () => {
    await fetchMedicationsForConsumer(db, 'u-session');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { startDate: 'desc' } }),
    );
  });
});

describe('fetchMedicationsForConsumer — dose is now visible (GOLD §2.3 revised)', () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([
      { id: 'm1', name: 'Testosterone Cypionate', startDate: new Date('2026-01-01'), endDate: null, dose: '200 mg weekly', frequency: 'weekly', route: 'im' },
      { id: 'm2', name: 'Anastrozole', startDate: new Date('2026-03-15'), endDate: new Date('2026-06-01') },
    ]);
  });

  it('SELECTS dose + frequency + route (patient-visible per GOLD §2.3)', async () => {
    await fetchMedicationsForConsumer(db, 'u-session');
    const call = findMany.mock.calls[0]![0] as { select: Record<string, boolean> };
    expect(call.select).toHaveProperty('dose', true);
    expect(call.select).toHaveProperty('frequency', true);
    expect(call.select).toHaveProperty('route', true);
    // And it DOES select the timing-only fields.
    expect(call.select).toHaveProperty('name', true);
    expect(call.select).toHaveProperty('startDate', true);
    expect(call.select).toHaveProperty('endDate', true);
  });

  it('returns a meds payload WITH dose/frequency/route on rows that have them', async () => {
    const result = await fetchMedicationsForConsumer(db, 'u-session');
    expect(result.meds).toHaveLength(2);
    // First med has dose data.
    expect(result.meds[0]).toHaveProperty('dose', '200 mg weekly');
    expect(result.meds[0]!.frequency).toBe('weekly');
    expect(result.meds[0]!.route).toBe('im');
    // Second med has no dose → null.
    expect(result.meds[1]!.dose).toBeNull();
    expect(result.meds[1]!.frequency).toBeNull();
  });

  it('maps startDate/endDate to ISO strings (null endDate stays null)', async () => {
    const { meds } = await fetchMedicationsForConsumer(db, 'u-session');
    expect(meds[0]).toEqual({
      id: 'm1',
      name: 'Testosterone Cypionate',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: null,
      dose: '200 mg weekly',
      frequency: 'weekly',
      route: 'im',
    });
  });
});

describe('fetchMedicationsForConsumer — graceful degradation by name (FIX-H)', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('OMITS (does NOT throw) a medication whose NAME trips the dosing scan', async () => {
    // A real TRT product name that carries a concentration — the COMMON case.
    // Before FIX-H, assertConsumerSafe scanned the whole payload incl. the name
    // and threw → the /dashboard/medications page 500'd for that user.
    findMany.mockResolvedValue([
      { id: 'm1', name: 'Testosterone Cypionate 200mg/ml', startDate: new Date('2026-01-01'), endDate: null },
    ]);
    const out = await fetchMedicationsForConsumer(db, 'u-session');
    // The dirty-named med never reaches the consumer list.
    expect(out.meds).toEqual([]);
    // …but it is recorded for human review (audit/count notice), with the
    // offending name (the page renders only the COUNT, never the name).
    expect(out.omissions).toEqual([
      { name: 'Testosterone Cypionate 200mg/ml', reason: 'dosing-pattern-in-name' },
    ]);
  });

  it('keeps clean meds and omits ONLY the dirty-named one (mixed)', async () => {
    findMany.mockResolvedValue([
      { id: 'm1', name: 'Anastrozole', startDate: new Date('2026-01-01'), endDate: null },
      { id: 'm2', name: 'Testosterone 200mg/ml', startDate: new Date('2026-02-01'), endDate: null },
    ]);
    const out = await fetchMedicationsForConsumer(db, 'u-session');
    expect(out.meds.map((m) => m.name)).toEqual(['Anastrozole']);
    expect(out.omissions).toHaveLength(1);
    expect(out.omissions[0]).toEqual({
      name: 'Testosterone 200mg/ml',
      reason: 'dosing-pattern-in-name',
    });
  });

  it('returns an empty omissions array when every name is clean', async () => {
    findMany.mockResolvedValue([
      { id: 'm1', name: 'Anastrozole', startDate: new Date('2026-01-01'), endDate: null },
    ]);
    const out = await fetchMedicationsForConsumer(db, 'u-session');
    expect(out.meds).toHaveLength(1);
    expect(out.omissions).toEqual([]);
  });

  it('assertConsumerSafe passes on name-only scan (dose values stripped before assertion)', async () => {
    // After partition, the lib checks assertConsumerSafe on a name-only strip so
    // patient-recorded dose/frequency/route values don't trip the regex. The returned
    // list still carries dose values (GOLD §2.3 revised).
    findMany.mockResolvedValue([
      { id: 'm1', name: 'Anastrozole', startDate: new Date('2026-01-01'), endDate: null },
      // This med has dosing text in its name AND dose value — it's omitted by the name scan.
      { id: 'm2', name: 'Testosterone 200mg/ml', startDate: new Date('2026-02-01'), endDate: null, dose: '5 mg daily' },
    ]);
    const out = await fetchMedicationsForConsumer(db, 'u-session');
    // m2 (dirty name) is omitted; only m1 survives.
    expect(out.meds.map((m) => m.name)).toEqual(['Anastrozole']);
    expect(out.omissions).toHaveLength(1);
    expect(out.omissions[0]!.name).toBe('Testosterone 200mg/ml');
    // The returned med still carries its dose value (even though it was omitted).
    expect(out.meds[0]).toHaveProperty('dose', null);
  });
});
