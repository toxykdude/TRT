'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Product render placeholder for the Technology section — a stylized mock of
 * the biomarker trend card (stands in for the template's hardware render).
 * Decorative only; all values are illustrative.
 */

const CHART_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 122],
  [78, 98],
  [158, 74],
  [258, 46],
  [320, 30],
];

type RowTone = 'mint' | 'amber';

const ROWS: ReadonlyArray<{
  nameKey: 'testosteroneName' | 'estradiolName' | 'hematocritName';
  statusKey: 'inRange' | 'watch';
  value: string;
  /** marker position across the range track, % */
  pct: number;
  tone: RowTone;
}> = [
  { nameKey: 'testosteroneName', statusKey: 'inRange', value: '642 ng/dL', pct: 62, tone: 'mint' },
  { nameKey: 'estradiolName', statusKey: 'inRange', value: '38 pg/mL', pct: 44, tone: 'mint' },
  { nameKey: 'hematocritName', statusKey: 'watch', value: '51.2 %', pct: 88, tone: 'amber' },
];

const TONE_CLASS: Record<RowTone, { dot: string; bar: string }> = {
  mint: { dot: 'bg-mint', bar: 'bg-gradient-to-r from-mint/60 to-mint' },
  amber: { dot: 'bg-amber-400', bar: 'bg-gradient-to-r from-amber-300 to-amber-400' },
};

export function ProductMockup() {
  const t = useTranslations('Technology.mockup');

  return (
    <div className="relative">
      {/* soft halo behind the device frame */}
      <div aria-hidden="true" className="absolute -inset-6 rounded-[2rem] bg-mint/10 blur-2xl dark:bg-mint/5" />

      {/* soft-shadowed device frame */}
      <div className="relative rounded-3xl bg-[#EEF1F4] p-4 shadow-inner dark:bg-white/5 sm:p-8">
        <div
          aria-hidden="true"
          className="rounded-2xl border border-black/5 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-card sm:p-6"
        >
          {/* window header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-mint" />
              <p className="text-sm font-semibold text-charcoal dark:text-foreground">
                {t('title')}
              </p>
            </div>
            <span className="rounded-full border border-mint/40 bg-mint/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-mint-dark dark:text-mint">
              {t('normalized')}
            </span>
          </div>

          {/* trend chart with reference-range band */}
          <svg viewBox="0 0 320 150" className="mt-5 w-full">
            <defs>
              <linearGradient id="mock-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00E6A1" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#00E6A1" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x="0" y="42" width="320" height="52" rx="4" fill="#00E6A1" fillOpacity="0.07" />
            <line x1="0" y1="42" x2="320" y2="42" stroke="#00E6A1" strokeOpacity="0.35" strokeDasharray="4 4" />
            <line x1="0" y1="94" x2="320" y2="94" stroke="#00E6A1" strokeOpacity="0.35" strokeDasharray="4 4" />
            <text x="8" y="38" fontSize="9" fill="#6B7280">
              {t('referenceRange')}
            </text>
            <path
              d="M0 122 C 30 116, 48 92, 78 98 S 128 66, 158 74 S 228 38, 258 46 S 300 34, 320 30 L 320 150 L 0 150 Z"
              fill="url(#mock-area-fill)"
            />
            <path
              d="M0 122 C 30 116, 48 92, 78 98 S 128 66, 158 74 S 228 38, 258 46 S 300 34, 320 30"
              fill="none"
              stroke="#00C189"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {CHART_POINTS.map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r="3.5" fill="#00785A" stroke="#FFFFFF" strokeWidth="1.5" />
            ))}
          </svg>

          {/* biomarker rows */}
          <ul className="mt-4 space-y-2.5">
            {ROWS.map((row) => (
              <li
                key={row.nameKey}
                className="rounded-xl border border-black/5 bg-gray-50 px-3.5 py-3 dark:border-white/5 dark:bg-white/5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-gray-700 dark:text-foreground/80">
                    {t(row.nameKey)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('h-1.5 w-1.5 rounded-full', TONE_CLASS[row.tone].dot)} />
                    <p className="text-xs font-semibold tabular-nums text-charcoal dark:text-foreground">
                      {row.value}
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
                  <div
                    className={cn('h-full rounded-full', TONE_CLASS[row.tone].bar)}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-gray-500 dark:text-muted-foreground">
                  {t(row.statusKey)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
