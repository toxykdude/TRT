'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function GenerateReportButton({
  resultCount,
  disabled,
}: {
  resultCount: number;
  disabled: boolean;
}) {
  const t = useTranslations('Dashboard.Reports');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/dashboard/reports/generate', { method: 'POST' });
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
    </div>
  );
}
