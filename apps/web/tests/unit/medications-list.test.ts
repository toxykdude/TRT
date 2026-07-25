/**
 * fetchMedicationsForConsumer — the consumer medications-list data access
 * (GOLD §5.11 / spec OQ#1, SRV-3 / FIX-H graceful degradation).
 *
 * Behavioral contract (mirrors the analytics overlay's timing-only philosophy):
 *  - the read is scoped `where: { ownerId }` (tenancy — prismaFor is BYPASSRLS).
 *  - the `select` returns ONLY {id, name, startDate, endDate}; it MUST NOT
 *    include dose/frequency/route/reason/clinician (OQ#1: these are "displayed
 *    NOWHERE" consumer-bound). This is structural defense-in-depth: dose can
 *    never reach the rendered list because it is never selected.
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

describe('fetchMedicationsForConsumer — dose never selected (SRV-3 / OQ#1)', () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([
      { id: 'm1', name: 'Testosterone Cypionate', startDate: new Date('2026-01-01'), endDate: null },
      { id: 'm2', name: 'Anastrozole', startDate: new Date('2026-03-15'), endDate: new Date('2026-06-01') },
    ]);
  });

  it('selects NO clinical-detail field (dose/frequency/route/reason/clinician)', async () => {
    await fetchMedicationsForConsumer(db, 'u-session');
    const call = findMany.mock.calls[0]![0] as { select: Record<string, boolean> };
    expect(call.select).not.toHaveProperty('dose');
    expect(call.select).not.toHaveProperty('frequency');
    expect(call.select).not.toHaveProperty('route');
    expect(call.select).not.toHaveProperty('reason');
    expect(call.select).not.toHaveProperty('clinician');
    // And it DOES select the timing-only fields.
    expect(call.select).toHaveProperty('name', true);
    expect(call.select).toHaveProperty('startDate', true);
    expect(call.select).toHaveProperty('endDate', true);
  });

  it('returns a meds payload with NO dose key on any row', async () => {
    const { meds } = await fetchMedicationsForConsumer(db, 'u-session');
    expect(meds).toHaveLength(2);
    for (const row of meds) {
      expect(row).not.toHaveProperty('dose');
      expect(row).not.toHaveProperty('frequency');
      expect(row).not.toHaveProperty('route');
      expect(row).not.toHaveProperty('reason');
      expect(row).not.toHaveProperty('clinician');
    }
  });

  it('maps startDate/endDate to ISO strings (null endDate stays null)', async () => {
    const { meds } = await fetchMedicationsForConsumer(db, 'u-session');
    expect(meds[0]).toEqual({
      id: 'm1',
      name: 'Testosterone Cypionate',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: null,
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

  it('the CLEANED meds list passes assertConsumerSafe (defense-in-depth backstop)', async () => {
    // After partition, the surviving meds are name-clean by construction. The
    // canonical fail-closed scan must therefore pass on them (AGENTS §1).
    findMany.mockResolvedValue([
      { id: 'm1', name: 'Anastrozole', startDate: new Date('2026-01-01'), endDate: null },
      { id: 'm2', name: 'Testosterone 200mg/ml', startDate: new Date('2026-02-01'), endDate: null },
    ]);
    const out = await fetchMedicationsForConsumer(db, 'u-session');
    expect(() => assertConsumerSafe(out.meds)).not.toThrow();
  });
});
