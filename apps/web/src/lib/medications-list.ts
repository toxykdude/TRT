/**
 * Consumer medications-list data access (GOLD §5.11 / spec OQ#1, SRV-3).
 *
 * The `/dashboard/medications` page is CONSUMER-BOUND (the patient's own
 * dashboard), so the list read is TIMING-ONLY — exactly the contract the
 * analytics overlay uses (see analytics-series.ts `stripMedicationToTiming`).
 *
 * SAFETY (GOLD §2.3 / spec OQ#1): for this change, dose (and
 * frequency/route/reason/clinician) is capture-and-store-only, "displayed
 * NOWHERE" consumer-bound. This helper enforces that BY CONSTRUCTION — the
 * `select` returns only {id, name, startDate, endDate}. `dose` is never
 * selected, so it can never reach the rendered list. The page does NOT route
 * this payload through `assertConsumerSafe` (that fail-closed gate guards the
 * analytics CHART payload); the defense here is the structural select, which is
 * the same two-layer philosophy (by-construction + by-scan) applied to a list.
 *
 * Tenancy: `where: { ownerId }` on every read — `prismaFor` is BYPASSRLS, so
 * app-layer scoping is the real gate (spec TC-7 / AGENTS §6).
 */
import type { PrismaClient } from '@trt/db';

/** A medication row reduced to identity + timing — no dosing field exists here. */
export type MedicationListItem = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
};

/**
 * Prisma client (or tx) this helper reads from. Typed against the real client so
 * the call site is sound; tests pass an in-memory mock cast to `never`.
 */
type Db = PrismaClient;

/** Convert a Date-or-string column value to an ISO string for serialization. */
function toIso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

/**
 * Fetch the signed-in patient's own medication history for the consumer list.
 *
 * @param db     Prisma client from `prismaFor(ownerId)` (BYPASSRLS → app-layer scoping).
 * @param ownerId the session user id — the ONLY owner whose rows are returned.
 */
export async function fetchMedicationsForConsumer(
  db: Db,
  ownerId: string,
): Promise<MedicationListItem[]> {
  const rows = await db.medication.findMany({
    where: { ownerId },
    orderBy: { startDate: 'desc' },
    // Timing-only select — NO dose/frequency/route/reason/clinician (OQ#1).
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startDate: toIso(r.startDate),
    endDate: toIso(r.endDate),
  }));
}
