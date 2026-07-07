import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { fmtDate } from '@/lib/utils';

export default async function TimelinePage() {
  const session = await auth();
  const db = prismaFor(session!.user.id);

  const labs = await db.labReport.findMany({ orderBy: { uploadedAt: 'desc' }, take: 20 });
  const meds = await db.medication.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });

  type Event = { date: string; type: string; label: string };
  const events: Event[] = [
    ...labs.map((l) => ({ date: fmtDate(l.uploadedAt), type: 'Lab', label: l.fileName })),
    ...meds.map((m) => ({ date: fmtDate(m.createdAt), type: 'Medication', label: m.name })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted-foreground">
          Every recorded event, in chronological order (GOLD §5.8).
        </p>
      </div>
      <SafetyBanner />
      <Card>
        <CardHeader>
          <CardTitle>Activity timeline</CardTitle>
          <CardDescription>{events.length} event(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No events yet. Upload a lab or add a medication to populate your timeline.
            </p>
          ) : (
            <ol className="relative border-l pl-6">
              {events.map((ev, i) => (
                <li key={i} className="mb-6">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                  <p className="text-sm font-medium">{ev.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {ev.type} · {ev.date}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
