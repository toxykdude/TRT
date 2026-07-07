import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { UploadZone } from '@/components/dashboard/upload-zone';
import { ManualEntry } from '@/components/dashboard/manual-entry';
import { LabsList } from '@/components/dashboard/labs-list';
import { fmtDate } from '@/lib/utils';

export default async function LabsPage() {
  const session = await auth();
  const db = prismaFor(session!.user.id);

  const reports = await db.labReport.findMany({
    orderBy: { uploadedAt: 'desc' },
    include: { _count: { select: { results: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Labs</h1>
        <p className="text-sm text-muted-foreground">
          Upload lab reports. Extraction is automatic but always surfaces for your review.
        </p>
      </div>

      <SafetyBanner />

      <Card>
        <CardHeader>
          <CardTitle>Upload lab reports</CardTitle>
          <CardDescription>PDF, JPG, PNG, or HEIC. Drag & drop or browse.</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadZone />
          <div className="mt-4 flex items-center gap-3 border-t pt-4">
            <ManualEntry />
            <span className="text-xs text-muted-foreground">
              Or{' '}
              <Link href="/dashboard/labs/results" className="text-primary hover:underline">
                view all results →
              </Link>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your lab reports</CardTitle>
          <CardDescription>
            {reports.length} report{reports.length === 1 ? '' : 's'} on file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LabsList
            reports={reports.map((r) => ({
              id: r.id,
              fileName: r.fileName,
              uploadedAt: fmtDate(r.uploadedAt),
              status: r.status,
              resultCount: r._count.results,
              reviewNeeded: r.reviewNeeded,
              laboratory: r.laboratory,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
