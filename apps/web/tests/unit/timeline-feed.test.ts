/**
 * fetchTimelineFeed — the dashboard timeline data access (FIX-G, GOLD §2.3/§6).
 *
 * CRITICAL: `prismaFor` is BYPASSRLS (packages/db), so app-layer `where:{ownerId}`
 * is the ONLY tenancy gate. Before this fix, the timeline read labs + medications
 * with NO `where` clause → an authenticated user saw EVERY tenant's lab filenames
 * and medication names (cross-tenant PHI leak). This suite pins the tenancy gate
 * AND the consumer-surface safety contract (dose never loads into server memory).
 *
 * The suite is hermetic: a mock db is passed directly to the pure lib function
 * (vitest node env; no jsdom / React rendering needed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTimelineFeed } from '@/lib/timeline-feed';

const labFindMany = vi.fn();
const medFindMany = vi.fn();
// Minimal mock client — only the surface this helper touches.
const db = {
  labReport: { findMany: labFindMany },
  medication: { findMany: medFindMany },
} as never;

describe('fetchTimelineFeed — tenancy (FIX-G / TC-7)', () => {
  beforeEach(() => {
    labFindMany.mockReset();
    medFindMany.mockReset();
    labFindMany.mockResolvedValue([]);
    medFindMany.mockResolvedValue([]);
  });

  it('scopes the LAB read to the session ownerId (cross-tenant PHI gate)', async () => {
    await fetchTimelineFeed(db, 'u-session');
    expect(labFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'u-session' } }),
    );
  });

  it('scopes the MEDICATION read to the session ownerId (cross-tenant PHI gate)', async () => {
    await fetchTimelineFeed(db, 'u-session');
    expect(medFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'u-session' } }),
    );
  });

  it('keeps both reads ordered desc and limited (timeline recency window)', async () => {
    await fetchTimelineFeed(db, 'u-session');
    expect(labFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { uploadedAt: 'desc' }, take: 20 }),
    );
    expect(medFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 20 }),
    );
  });
});

describe('fetchTimelineFeed — dose never loaded into server memory (GOLD §2.3)', () => {
  beforeEach(() => {
    labFindMany.mockReset();
    medFindMany.mockReset();
  });

  it('selects NO dosing field on the medication read', async () => {
    await fetchTimelineFeed(db, 'u-session');
    const call = medFindMany.mock.calls[0]![0] as { select: Record<string, boolean> };
    // The hard requirement: dose never loads into server memory on this consumer
    // surface. frequency/route/reason/clinician are omitted too (analytics-spine
    // forbidden fields) — the timeline renders only name + createdAt.
    expect(call.select).not.toHaveProperty('dose');
    expect(call.select).not.toHaveProperty('frequency');
    expect(call.select).not.toHaveProperty('route');
    expect(call.select).not.toHaveProperty('reason');
    expect(call.select).not.toHaveProperty('clinician');
    // And it DOES select identity/timing.
    expect(call.select).toHaveProperty('id', true);
    expect(call.select).toHaveProperty('name', true);
    expect(call.select).toHaveProperty('createdAt', true);
  });

  it('selects only rendered fields on the lab read (no PHI results column)', async () => {
    await fetchTimelineFeed(db, 'u-session');
    const call = labFindMany.mock.calls[0]![0] as { select: Record<string, boolean> };
    expect(call.select).toHaveProperty('id', true);
    expect(call.select).toHaveProperty('fileName', true);
    expect(call.select).toHaveProperty('uploadedAt', true);
    // The timeline renders only fileName + uploadedAt — a full LabReport row would
    // load PHI results into server memory needlessly. Select pins the minimal set.
    expect(call.select).not.toHaveProperty('content');
    expect(call.select).not.toHaveProperty('extractedJson');
  });

  it('returns a { labs, meds } payload with NO dosing key on any med row', async () => {
    medFindMany.mockResolvedValue([
      { id: 'm1', name: 'Testosterone Cypionate', createdAt: new Date('2026-01-05') },
    ]);
    labFindMany.mockResolvedValue([
      { id: 'l1', fileName: 'labs-jan.pdf', uploadedAt: new Date('2026-01-03') },
    ]);
    const out = await fetchTimelineFeed(db, 'u-session');
    expect(out.meds).toHaveLength(1);
    expect(out.labs).toHaveLength(1);
    for (const med of out.meds) {
      expect(med).not.toHaveProperty('dose');
      expect(med).not.toHaveProperty('frequency');
      expect(med).not.toHaveProperty('route');
    }
    // Rendered identity/timing are present.
    expect(out.meds[0]).toEqual({
      id: 'm1',
      name: 'Testosterone Cypionate',
      createdAt: new Date('2026-01-05'),
    });
    expect(out.labs[0]).toEqual({
      id: 'l1',
      fileName: 'labs-jan.pdf',
      uploadedAt: new Date('2026-01-03'),
    });
  });
});
