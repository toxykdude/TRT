'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { QuotaExceededDialog, type QuotaPayload } from './quota-exceeded-dialog';
import { classifyExtractResponse } from '@/lib/extract-flow';

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
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<{ id: string; message: string } | null>(null);
  const [quota, setQuota] = useState<QuotaPayload | null>(null);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const t = useTranslations('LabsList');
  const tCommon = useTranslations('Dashboard');
  const labStatusT = useTranslations('LabStatus');

  const extract = async (id: string) => {
    setBusy(id);
    setExtractError(null);
    try {
      const res = await fetch('/dashboard/labs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labReportId: id }),
      });
      const body = await res.json().catch(() => null);
      const outcome = classifyExtractResponse(res.status, body);
      if (outcome.kind === 'quota') {
        setQuota(outcome.payload);
        setQuotaOpen(true);
      } else if (outcome.kind === 'error') {
        // Structured, PHI-free message surfaced inline — never silently swallowed.
        setExtractError({ id, message: outcome.message });
      }
      // Soft refresh of the server-rendered list (no full window.location.reload()).
      router.refresh();
    } catch {
      setExtractError({ id, message: t('extractFailed') });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (reports.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
    );
  }

  return (
    <div className="space-y-1">
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

      {extractError && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
          <p className="flex flex-1 items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{extractError.message}</span>
          </p>
          <Button size="sm" variant="outline" onClick={() => extract(extractError.id)}>
            <RefreshCw className="mr-1 h-3 w-3" />
            {t('retry')}
          </Button>
        </div>
      )}

      <QuotaExceededDialog open={quotaOpen} onOpenChange={setQuotaOpen} payload={quota} />
    </div>
  );
}
