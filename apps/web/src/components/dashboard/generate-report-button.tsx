'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuotaExceededDialog, type QuotaPayload } from './quota-exceeded-dialog';

export function GenerateReportButton({
  resultCount,
  disabled,
}: {
  resultCount: number;
  disabled: boolean;
}) {
  const t = useTranslations('Dashboard.Reports');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaPayload | null>(null);
  const [quotaOpen, setQuotaOpen] = useState(false);

  // DEV-ONLY preview affordance — inert in production builds.
  const forceQuotaWall =
    process.env.NODE_ENV !== 'production' &&
    ['1', 'true'].includes((searchParams.get('forceQuotaWall') ?? '').toLowerCase());

  const run = async () => {
    setBusy(true);
    setErr(null);

    if (forceQuotaWall) {
      const now = new Date();
      const y = now.getUTCFullYear();
      const q = Math.floor(now.getUTCMonth() / 3) + 1;
      const payload: QuotaPayload = {
        error: 'quota_exceeded',
        kind: 'REPORT',
        plan: 'FREE',
        used: 1,
        limit: 1,
        period: `${y}-Q${q}`,
        upgradeUrl: `/${locale}/#pricing`,
      };
      setQuota(payload);
      setQuotaOpen(true);
      setBusy(false);
      return;
    }

    try {
      const res = await fetch('/dashboard/reports/generate', { method: 'POST' });
      if (res.status === 402) {
        const body = (await res.json().catch(() => null)) as Partial<QuotaPayload> | null;
        if (body && body.error === 'quota_exceeded') {
          setBusy(false);
          setQuota(body as QuotaPayload);
          setQuotaOpen(true);
          return;
        }
      }
      if (!res.ok) throw new Error(await res.text());
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setBusy(false);
    }
  };

  return (
    <div>
      <Button onClick={run} disabled={disabled || busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
        {t('generateButton', { count: resultCount })}
      </Button>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      <QuotaExceededDialog open={quotaOpen} onOpenChange={setQuotaOpen} payload={quota} />
    </div>
  );
}
