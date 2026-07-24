import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Dashboard } from '@/components/dashboard';
import { isVerifiedClinician } from '@/lib/report-policy';
import { fmtDate } from '@/lib/utils';

type ReportRow = {
  id: string;
  generatedAt: Date;
  generatedBy: string;
  sections: Record<string, unknown>;
  redFlags: string[];
  dataRangeStart: Date | null;
  dataRangeEnd: Date | null;
};

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const db = prismaFor(session!.user.id);

  const report = (await db.report.findFirst({
    where: { id, ownerId: session!.user.id },
  })) as ReportRow | null;

  if (!report) notFound();

  // Authoritative dosing gate (GOLD §2.4): re-read role + licenseVerifiedAt
  // from the DB — the JWT role is a coarse UI gate only.
  const viewer = await db.user.findUnique({
    where: { id: session!.user.id },
    select: { role: true, licenseVerifiedAt: true },
  });
  const viewerCanSeeDosing = isVerifiedClinician(viewer?.role, viewer?.licenseVerifiedAt ?? null);

  return (
    <Dashboard
      viewerCanSeeDosing={viewerCanSeeDosing}
      report={{
        sections: report.sections as never,
        generatedAt: fmtDate(report.generatedAt),
        generatedBy: report.generatedBy,
        redFlags: report.redFlags,
      }}
    />
  );
}
