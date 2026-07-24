import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { fmtDate } from '@/lib/utils';

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Timeline');

  const session = await auth();
  const db = prismaFor(session!.user.id);

  const labs = await db.labReport.findMany({ orderBy: { uploadedAt: 'desc' }, take: 20 });
  const meds = await db.medication.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });

  type Event = { date: string; type: string; label: string };
  const events: Event[] = [
    ...labs.map((l) => ({ date: fmtDate(l.uploadedAt), type: t('typeLab'), label: l.fileName })),
    ...meds.map((m) => ({ date: fmtDate(m.createdAt), type: t('typeMedication'), label: m.name })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <SafetyBanner />
      <Card>
        <CardHeader>
          <CardTitle>{t('activityTitle')}</CardTitle>
          <CardDescription>{t('eventCount', { count: events.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('noEvents')}</p>
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
