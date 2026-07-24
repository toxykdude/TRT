'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type View = 'patient' | 'clinician';

/**
 * Overview copy switches between audiences. Mint highlight uses the deepened
 * `mint-dark` on light surfaces for AA contrast (bright mint is on-dark only).
 */
const COPY: Record<View, { statement: ReactNode; note: string }> = {
  patient: {
    statement: (
      <>
        TRT Insights is dramatically changing how people understand their own hormone therapy —
        every lab, every trend, every symptom, finally on{' '}
        <span className="text-mint-dark dark:text-mint">one clinical timeline</span>.
      </>
    ),
    note: 'Upload your history once. We normalize every biomarker against its lab-specific reference range, so you walk into every appointment prepared.',
  },
  clinician: {
    statement: (
      <>
        TRT Insights is dramatically shortening the path from raw lab data to clinical
        conversation — normalized values, trend math, and{' '}
        <span className="text-mint-dark dark:text-mint">physician-ready summaries</span> in
        seconds.
      </>
    ),
    note: 'A deterministic rules engine — not a black box — produces every baseline classification, so what you review is reproducible and auditable.',
  },
};

/**
 * Overview / transition section. The template's "COMPETITOR VIEW" toggle is
 * adapted as a Patient ⇄ Clinician audience switch that swaps the statement.
 */
export function Overview() {
  const [view, setView] = useState<View>('patient');
  const isClinician = view === 'clinician';

  return (
    <section id="overview" className="bg-white py-24 dark:bg-background sm:py-32">
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">
            Overview
          </p>

          {/* Audience toggle (role="switch" for assistive tech) */}
          <div className="flex items-center gap-3">
            <span
              id="overview-view-label"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400"
            >
              Clinician view
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
            {COPY[view].statement}
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-muted-foreground">
            {COPY[view].note}
          </p>
        </div>
      </div>
    </section>
  );
}
