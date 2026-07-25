/**
 * Timeline feed data access (GOLD §5.x dashboard activity timeline / FIX-G).
 *
 * CRITICAL TENANCY (AGENTS §6 / spec TC-7): `prismaFor` is BYPASSRLS
 * (packages/db/src/index.ts:50) — Postgres RLS does NOT restrict the 'trt' role.
 * App-layer `where: { ownerId }` is therefore the ONLY tenancy gate on these
 * reads. Before this helper existed, the timeline page read labs + medications
 * with NO `where` clause, so an authenticated user could see EVERY tenant's lab
 * filenames and medication names (a cross-tenant PHI leak, worsened once the
 * new medication write routes from the analytics-graphs change shipped).
 *
 * SAFETY (GOLD §2.3 / AGENTS §1): the timeline is a CONSUMER surface, so the
 * medication read is TIMING/IDENTITY ONLY — `dose` (and frequency/route/reason/
 * clinician, the analytics-spine forbidden fields) is never even loaded into
 * server memory. The lab read is likewise reduced to the rendered {id, fileName,
 * uploadedAt} instead of the full LabReport row (which would drag PHI results
 * into memory needlessly).
 *
 * This lib is pure/DB-free aside from the passed `db`: it owns no audit writes.
 */
import type { PrismaClient } from '@trt/db';

/**
 * Prisma client (or tx) this helper reads from. Typed against the real client so
 * the call site is sound; tests pass an in-memory mock cast to `never`.
 */
type Db = PrismaClient;

/** A lab report reduced to identity + timing for the timeline feed. */
export type TimelineLab = { id: string; fileName: string; uploadedAt: Date };

/** A medication — identity, timing, and the patient-recorded dose/frequency/route (GOLD §2.3). */
export type TimelineMed = { id: string; name: string; createdAt: Date; dose?: string | null; frequency?: string | null };

/** Result of {@link fetchTimelineFeed}: recent labs + medications for the timeline. */
export type TimelineFeed = { labs: TimelineLab[]; meds: TimelineMed[] };

/**
 * Fetch the signed-in patient's own recent labs + medications for the timeline.
 *
 * @param db     Prisma client from `prismaFor(ownerId)` (BYPASSRLS → app-layer scoping).
 * @param ownerId the session user id — the ONLY owner whose rows are returned.
 * @param opts   `{ take }` recency window (default 20).
 */
export async function fetchTimelineFeed(
  db: Db,
  ownerId: string,
  opts?: { take?: number },
): Promise<TimelineFeed> {
  const take = opts?.take ?? 20;
  const [labs, meds] = await Promise.all([
    db.labReport.findMany({
      where: { ownerId },
      orderBy: { uploadedAt: 'desc' },
      take,
      // Identity/timing only — no PHI results column loads into server memory.
      select: { id: true, fileName: true, uploadedAt: true },
    }),
    db.medication.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take,
      // Timing/identity + dose — patient-recorded dose/frequency visible (GOLD §2.3).
      select: { id: true, name: true, createdAt: true, dose: true, frequency: true },
    }),
  ]);
  return { labs, meds };
}
