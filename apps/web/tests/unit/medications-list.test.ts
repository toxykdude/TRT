/**
 * fetchMedicationsForConsumer — the consumer medications-list data access
 * (GOLD §5.11 / spec OQ#1, SRV-3).
 *
 * Behavioral contract (mirrors the analytics overlay's timing-only philosophy):
 *  - the read is scoped `where: { ownerId }` (tenancy — prismaFor is BYPASSRLS).
 *  - the `select` returns ONLY {id, name, startDate, endDate}; it MUST NOT
 *    include dose/frequency/route/reason/clinician (OQ#1: these are "displayed
 *    NOWHERE" consumer-bound in this change). This is structural defense-in-depth:
 *    dose can never reach the rendered list because it is never selected.
 *  - the mapped payload carries no dosing key either.
 *
 * The suite is hermetic: a mock db is passed directly to the pure lib function
 * (vitest runs in the node env; no jsdom / React rendering needed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('returns a payload with NO dose key on any row', async () => {
    const rows = await fetchMedicationsForConsumer(db, 'u-session');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty('dose');
      expect(row).not.toHaveProperty('frequency');
      expect(row).not.toHaveProperty('route');
      expect(row).not.toHaveProperty('reason');
      expect(row).not.toHaveProperty('clinician');
    }
  });

  it('maps startDate/endDate to ISO strings (null endDate stays null)', async () => {
    const rows = await fetchMedicationsForConsumer(db, 'u-session');
    expect(rows[0]).toEqual({
      id: 'm1',
      name: 'Testosterone Cypionate',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: null,
    });
  });
});
