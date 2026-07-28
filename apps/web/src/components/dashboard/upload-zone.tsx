'use client';

import { useState, useCallback, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { UploadCloud, File as FileIcon, Loader2, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { QuotaExceededDialog, type QuotaPayload } from './quota-exceeded-dialog';
import { classifyExtractResponse, extractRedirectTarget } from '@/lib/extract-flow';

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.heic';

/**
 * Upload + auto-extract orchestration (streamline-upload-to-insight §2.2).
 *
 * After a successful upload the client auto-chains extraction (the vision call
 * is too slow to inline in the upload route), then progresses to a locale-
 * prefixed route: review-required → the review surface, else analysis. A 402
 * opens the upgrade dialog; any other failure shows inline retry + manual entry.
 * The structured-outcome decision lives in `@/lib/extract-flow` (unit-tested).
 */
export function UploadZone() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('Upload');
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<{ labReportId: string; message: string } | null>(null);
  const [quota, setQuota] = useState<QuotaPayload | null>(null);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    setError(null);
    setExtractError(null);
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
  }, []);

  const runExtraction = useCallback(
    async (labReportId: string) => {
      setExtracting(true);
      setExtractError(null);
      try {
        const res = await fetch('/dashboard/labs/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labReportId }),
        });
        const body = await res.json().catch(() => null);
        const outcome = classifyExtractResponse(res.status, body);
        if (outcome.kind === 'quota') {
          setQuota(outcome.payload);
          setQuotaOpen(true);
          startTransition(() => router.refresh());
          return;
        }
        if (outcome.kind === 'error') {
          setExtractError({ labReportId, message: outcome.message });
          startTransition(() => router.refresh());
          return;
        }
        // ok → locale-prefixed progression (review surface when pending, else analysis).
        window.location.assign(extractRedirectTarget(outcome.pendingReview, locale, labReportId));
      } catch {
        setExtractError({ labReportId, message: t('manualEntry') });
        startTransition(() => router.refresh());
      } finally {
        setExtracting(false);
      }
    },
    [locale, router, t],
  );

  const uploadAll = async () => {
    setError(null);
    setExtractError(null);
    let lastLabReportId: string | null = null;
    for (const file of files) {
      setProgress((p) => ({ ...p, [file.name]: 0 }));
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch('/dashboard/labs/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `Upload failed for ${file.name}`);
        }
        const body = (await res.json()) as { ok: boolean; labReportId: string };
        lastLabReportId = body.labReportId;
        setProgress((p) => ({ ...p, [file.name]: 100 }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
        return;
      }
    }
    setFiles([]);
    setProgress({});
    // Auto-chain extraction on the most recent upload (design.md sequence).
    if (lastLabReportId) {
      await runExtraction(lastLabReportId);
    } else {
      startTransition(() => router.refresh());
    }
  };

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
          dragging ? 'border-primary bg-accent/50' : 'border-border hover:border-primary/50',
        )}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">{t('dropHere')}</p>
        <p className="text-xs text-muted-foreground">{t('formats')}</p>
        {/* Pre-upload messaging: extraction uses the allowance (spec requirement). */}
        <p className="text-xs text-muted-foreground">{t('usesAllowance')}</p>
        <input
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <FileIcon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
              {progress[f.name] !== undefined && (
                <span className="text-xs text-muted-foreground">{progress[f.name]}%</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {extracting && (
        <div className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-600 dark:text-blue-400" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {t('extracting')}
          </span>
        </div>
      )}

      {extractError && !extracting && (
        <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
          <p className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {extractError.message}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runExtraction(extractError.labReportId)}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              {t('retry')}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={`/${locale}/dashboard/labs`}>{t('manualEntry')}</a>
            </Button>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <Button onClick={uploadAll} disabled={pending || extracting}>
          {pending || extracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('uploadButton', { count: files.length })}
        </Button>
      )}

      <QuotaExceededDialog open={quotaOpen} onOpenChange={setQuotaOpen} payload={quota} />
    </div>
  );
}
