'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Check, Pencil, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReviewRow, ReviewReason } from '@/lib/review-flow';

/**
 * Confirm / correct / manually re-enter PENDING_REVIEW values (spec Req 4).
 *
 * Each row offers three actions:
 *  - confirm  — the extracted value is accurate as-is → flip to CONFIRMED.
 *  - correct  — overwrite the value/unit/range, then confirm.
 *  - manual   — re-enter against a canonical biomarker key, then confirm.
 *
 * On submit the batch is POSTed to /dashboard/labs/confirm (ownerId-bound in the
 * route). Errors are surfaced as PHI-free generic copy. After a successful
 * confirmation the user is routed to the analysis surface (locale-prefixed).
 */
export function ReviewForm({
  labReportId,
  rows,
  locale,
}: {
  labReportId: string;
  rows: ReviewRow[];
  locale: string;
}) {
  const router = useRouter();
  const t = useTranslations('Dashboard.Review');
  const biomarkersT = useTranslations('Biomarkers');

  // Track which action each row uses: default 'confirm'. Per-row override inputs.
  const [action, setAction] = useState<Record<string, 'confirm' | 'correct' | 'manual'>>(
    Object.fromEntries(rows.map((r) => [r.labResultId, 'confirm'])),
  );
  const [overrides, setOverrides] = useState<
    Record<string, { value: string; unit: string; refLow: string; refHigh: string; biomarkerKey: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const localizedReason: Record<ReviewReason, string> = {
    unmapped: t('reasonUnmapped'),
    low_confidence: t('reasonLowConfidence'),
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const results = rows.map((r) => {
        const a = action[r.labResultId] ?? 'confirm';
        const ov = overrides[r.labResultId];
        if (a === 'confirm') return { labResultId: r.labResultId, action: 'confirm' as const };
        if (a === 'correct') {
          return {
            labResultId: r.labResultId,
            action: 'correct' as const,
            value: ov?.value ?? r.value,
            unit: ov?.unit || undefined,
            refLow: ov?.refLow || undefined,
            refHigh: ov?.refHigh || undefined,
          };
        }
        return {
          labResultId: r.labResultId,
          action: 'manual' as const,
          biomarkerKey: ov?.biomarkerKey ?? '',
          value: ov?.value ?? '',
          unit: ov?.unit || undefined,
        };
      });

      const res = await fetch('/dashboard/labs/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labReportId, results }),
      });

      if (res.status === 401) {
        setErr(t('errUnauthorized'));
        return;
      }
      if (!res.ok) {
        // Generic, PHI-free message — never echo a raw server error.
        setErr(t('errFailed'));
        return;
      }

      // Locale-prefixed redirect to the analysis surface.
      router.push(`/${locale}/dashboard/analysis`);
    } catch {
      setErr(t('errFailed'));
    } finally {
      setBusy(false);
    }
  };

  const setAct = (id: string, a: 'confirm' | 'correct' | 'manual') =>
    setAction((prev) => ({ ...prev, [id]: a }));
  const setOv = (
    id: string,
    patch: Partial<{ value: string; unit: string; refLow: string; refHigh: string; biomarkerKey: string }>,
  ) => setOverrides((prev) => ({ ...prev, [id]: { value: '', unit: '', refLow: '', refHigh: '', biomarkerKey: '', ...prev[id], ...patch } }));

  return (
    <div className="space-y-6">
      <ul className="divide-y">
        {rows.map((r) => {
          const a = action[r.labResultId] ?? 'confirm';
          const name = biomarkersT.has(r.name) ? biomarkersT(r.name) : r.name;
          return (
            <li key={r.labResultId} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{name}</p>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  {localizedReason[r.reason]}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.value} {r.unit} · {t('refRange')}: {r.refText}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant={a === 'confirm' ? 'default' : 'outline'} onClick={() => setAct(r.labResultId, 'confirm')}>
                  <Check className="mr-1 h-3 w-3" /> {t('actionConfirm')}
                </Button>
                <Button size="sm" variant={a === 'correct' ? 'default' : 'outline'} onClick={() => setAct(r.labResultId, 'correct')}>
                  <Pencil className="mr-1 h-3 w-3" /> {t('actionCorrect')}
                </Button>
                <Button size="sm" variant={a === 'manual' ? 'default' : 'outline'} onClick={() => setAct(r.labResultId, 'manual')}>
                  <Keyboard className="mr-1 h-3 w-3" /> {t('actionManual')}
                </Button>
              </div>

              {a === 'correct' && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input
                    aria-label={t('fieldValue')}
                    className={inputCls}
                    placeholder={t('fieldValue')}
                    defaultValue={r.value === '—' ? '' : r.value}
                    onChange={(e) => setOv(r.labResultId, { value: e.target.value })}
                  />
                  <input
                    aria-label={t('fieldUnit')}
                    className={inputCls}
                    placeholder={t('fieldUnit')}
                    defaultValue={r.unit === '—' ? '' : r.unit}
                    onChange={(e) => setOv(r.labResultId, { unit: e.target.value })}
                  />
                  <input
                    aria-label={t('fieldRefLow')}
                    className={inputCls}
                    placeholder={t('fieldRefLow')}
                    onChange={(e) => setOv(r.labResultId, { refLow: e.target.value })}
                  />
                  <input
                    aria-label={t('fieldRefHigh')}
                    className={inputCls}
                    placeholder={t('fieldRefHigh')}
                    onChange={(e) => setOv(r.labResultId, { refHigh: e.target.value })}
                  />
                </div>
              )}

              {a === 'manual' && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <input
                    aria-label={t('fieldBiomarkerKey')}
                    className={inputCls}
                    placeholder={t('fieldBiomarkerKey')}
                    onChange={(e) => setOv(r.labResultId, { biomarkerKey: e.target.value })}
                  />
                  <input
                    aria-label={t('fieldValue')}
                    className={inputCls}
                    placeholder={t('fieldValue')}
                    onChange={(e) => setOv(r.labResultId, { value: e.target.value })}
                  />
                  <input
                    aria-label={t('fieldUnit')}
                    className={inputCls}
                    placeholder={t('fieldUnit')}
                    onChange={(e) => setOv(r.labResultId, { unit: e.target.value })}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {err && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          <span className="flex-1">{err}</span>
        </div>
      )}

      <Button onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
        {t('submit')}
      </Button>
    </div>
  );
}

const inputCls = cn(
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
);
