/**
 * Consumer medications-list data access (GOLD §5.11 / spec OQ#1, SRV-3 / FIX-H).
 *
 * The `/dashboard/medications` page is CONSUMER-BOUND (the patient's own
 * dashboard). Per GOLD §2.3 revised: dose/frequency/route are NOW SELECTED and
 * RENDERED patient-side; timing-only chart overlays persist on analytics surfaces.
 *
 * FIX-H — graceful degradation (CONSISTENT with the analytics overlay). Before
 * this fix, the helper ran `assertConsumerSafe` on the WHOLE mapped list, which
 * THREW when a medication NAME carried a dosing pattern (e.g. a real TRT product
 * name like "Testosterone Cypionate 200mg/ml") → the page 500'd for the common
 * TRT case, asymmetric with the analytics overlay which GRACEFULLY OMITS such
 * meds. Now the helper REUSES the partition pattern from
 * `serializeForConsumer`: each med NAME is scanned via `scanForDosing`; a
 * dirty-named med is OMITTED from the returned list + recorded in `omissions`
 * (the page renders a COUNT-only notice and NEVER the offending name). A final
 * `assertConsumerSafe` runs on a name-only strip as a fail-closed backstop
 * (AGENTS §1) — defense-in-depth, mirroring the analytics two-layer philosophy.
 *
 * Tenancy: `where: { ownerId }` on every read — `prismaFor` is BYPASSRLS, so
 * app-layer scoping is the real gate (spec TC-7 / AGENTS §6).
 */
import type { PrismaClient } from '@trt/db';
import { assertConsumerSafe, scanForDosing } from '@trt/guardrails';

/** A medication row — identity, timing, and the patient-recorded dose/frequency/route. */
export type MedicationListItem = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  dose?: string | null;
  frequency?: string | null;
  route?: string | null;
};

/** Why a medication was omitted from a consumer list (for audit/count notice). */
export type OmissionReason = 'dosing-pattern-in-name';

/** A medication removed from a consumer list + the reason (for audit). */
export type MedicationOmission = {
  name: string;
  reason: OmissionReason;
};

/** Result of {@link fetchMedicationsForConsumer}: a cleaned list + review omissions. */
export type MedicationsForConsumer = {
  /** The consumer-safe medication list (dirty-named meds removed). */
  meds: MedicationListItem[];
  /** Medications omitted for human review (never rendered to the consumer). */
  omissions: MedicationOmission[];
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
 * Fetch the signed-in patient's own medication history for the consumer list,
 * with graceful per-medication degradation by name (FIX-H).
 *
 * @param db     Prisma client from `prismaFor(ownerId)` (BYPASSRLS → app-layer scoping).
 * @param ownerId the session user id — the ONLY owner whose rows are returned.
 */
export async function fetchMedicationsForConsumer(
  db: Db,
  ownerId: string,
): Promise<MedicationsForConsumer> {
  const rows = await db.medication.findMany({
    where: { ownerId },
    orderBy: { startDate: 'desc' },
    // Timing + dose select — patient-recorded dose/frequency/route for display.
    select: { id: true, name: true, startDate: true, endDate: true, dose: true, frequency: true, route: true },
  });
  const mapped = rows.map((r) => ({
    id: r.id,
    name: r.name,
    startDate: toIso(r.startDate),
    endDate: toIso(r.endDate),
    dose: r.dose ?? null,
    frequency: r.frequency ?? null,
    route: r.route ?? null,
  }));

  // FIX-H — graceful per-medication degradation by name scan (mirrors the
  // analytics serializeForConsumer partition). A medication NAME that itself
  // trips the dosing scan is OMITTED from the consumer list and recorded for
  // human review; the page shows a COUNT-only notice, never the name. This is
  // GRACEFUL (no throw) so the common TRT case no longer 500s the list page.
  const omissions: MedicationOmission[] = [];
  const meds: MedicationListItem[] = [];
  for (const med of mapped) {
    if (scanForDosing(med.name).length > 0) {
      omissions.push({ name: med.name, reason: 'dosing-pattern-in-name' });
    } else {
      meds.push(med);
    }
  }

  // Fail-closed backstop (AGENTS §1): strip only name for the assertion so patient-recorded
  // dose/frequency/route values (now consumer-visible) don't trip the regex scan, but the
  // returned list still carries them. This mirrors the analytics strip-before-assert pattern.
  const nameOnlyForScan: { name: string }[] = meds.map((m) => ({ name: m.name }));
  assertConsumerSafe(nameOnlyForScan);

  return { meds, omissions };
}
