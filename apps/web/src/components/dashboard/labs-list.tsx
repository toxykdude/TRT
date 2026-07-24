'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LabReportRow = {
  id: string;
  fileName: string;
  uploadedAt: string;
  status: string;
  resultCount: number;
  reviewNeeded: boolean;
  laboratory: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  UPLOADED: 'bg-secondary text-secondary-foreground',
  EXTRACTING: 'bg-blue-500/15 text-blue-500',
  EXTRACTED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  REVIEW_NEEDED: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  FAILED: 'bg-destructive/15 text-destructive',
};

export function LabsList({ reports }: { reports: LabReportRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const t = useTranslations('LabsList');
  const tCommon = useTranslations('Dashboard');
  const labStatusT = useTranslations('LabStatus');

  const extract = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch('/dashboard/labs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labReportId: id }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      // surfaced by the next list refresh
    } finally {
      setBusy(null);
      // Soft refresh via navigation so the server list re-reads.
      window.location.reload();
    }
  };

  if (reports.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
    );
  }

  return (
    <ul className="divide-y">
      {reports.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {r.laboratory ? `${r.laboratory} · ` : ''}
              {t('uploaded', { date: r.uploadedAt })} · {t('valueCount', { count: r.resultCount })}
            </p>
          </div>

          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[r.status])}>
            {labStatusT(r.status)}
          </span>

          {r.reviewNeeded && (
            <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3 w-3" /> {tCommon('review')}
            </span>
          )}

          {(r.status === 'UPLOADED' || r.status === 'FAILED') && (
            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => extract(r.id)}>
              {busy === r.id ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              {t('extract')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
