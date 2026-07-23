import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Dashboard } from '@/components/dashboard';
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

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const db = prismaFor(session!.user.id);

  const report = (await db.report.findFirst({
    where: { id, ownerId: session!.user.id },
  })) as ReportRow | null;

  if (!report) notFound();

  return (
    <Dashboard
      report={{
        sections: report.sections as never,
        generatedAt: fmtDate(report.generatedAt),
        generatedBy: report.generatedBy,
        redFlags: report.redFlags,
      }}
    />
  );
}
