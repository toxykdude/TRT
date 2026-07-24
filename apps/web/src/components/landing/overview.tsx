'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type View = 'patient' | 'clinician';

/**
 * Overview / transition section. The Patient ⇄ Clinician audience toggle
 * swaps the statement. Mint highlight uses the deepened `mint-dark` on light
 * surfaces for AA contrast (bright mint is on-dark only).
 */
export function Overview() {
  const t = useTranslations('Overview');
  const [view, setView] = useState<View>('patient');
  const isClinician = view === 'clinician';

  const highlight = (chunks: React.ReactNode) => (
    <span className="text-mint-dark dark:text-mint">{chunks}</span>
  );

  return (
    <section id="overview" className="bg-white py-24 dark:bg-background sm:py-32">
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">
            {t('label')}
          </p>

          {/* Audience toggle (role="switch" for assistive tech) */}
          <div className="flex items-center gap-3">
            <span
              id="overview-view-label"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400"
            >
              {t('clinicianView')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isClinician}
              aria-labelledby="overview-view-label"
              onClick={() => setView(isClinician ? 'patient' : 'clinician')}
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-dark focus-visible:ring-offset-2',
                isClinician ? 'bg-mint-dark' : 'bg-gray-300 dark:bg-white/15',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300',
                  isClinician && 'translate-x-[22px]',
                )}
              />
            </button>
          </div>
        </div>

        {/* key remount replays the fade transition on audience switch */}
        <div key={view} className="animate-fade-up">
          <h2 className="mt-12 max-w-4xl text-3xl font-semibold leading-[1.15] tracking-tight text-charcoal dark:text-foreground sm:text-5xl">
            {view === 'patient'
              ? t.rich('patientStatement', { highlight })
              : t.rich('clinicianStatement', { highlight })}
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-muted-foreground">
            {view === 'patient' ? t('patientNote') : t('clinicianNote')}
          </p>
        </div>
      </div>
    </section>
  );
}
