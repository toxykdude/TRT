'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { HeroBackground } from '@/components/landing/hero-background';
import { CtaButton } from '@/components/landing/cta-button';
import { SafetyBanner } from '@/components/safety-banner';

/**
 * Full-viewport dark hero. Deliberately fixed-dark in both themes (brand
 * surface), with the clinical disclaimer kept on-screen per GOLD §2.
 */
export function Hero() {
  const t = useTranslations('Hero');
  const tc = useTranslations('Common');

  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden">
      <HeroBackground />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 pb-24 pt-32 sm:px-8">
        {/* Trust signal (GOLD §2 positioning) */}
        <span className="inline-flex w-fit animate-fade-up items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur">
          {t('trustSignal')}
        </span>

        <h1 className="mt-8 animate-fade-up text-5xl font-bold leading-[1.02] tracking-tight text-white sm:text-7xl lg:text-8xl">
          {t('title1')}
          <br />
          <span className="text-mint drop-shadow-[0_0_28px_rgba(0,230,161,0.35)]">{t('title2')}</span>
          <br />
          {t('title3')}
        </h1>

        <p className="mt-6 max-w-2xl animate-fade-up text-lg leading-relaxed text-gray-300 sm:text-xl">
          {t('subtitle')}
        </p>

        <div className="mt-8 flex animate-fade-up flex-wrap items-center gap-5">
          <CtaButton href="/register">{tc('getStarted')}</CtaButton>
          <Link
            href="/login"
            className="rounded-sm text-sm font-medium text-white/70 underline-offset-4 transition-colors duration-200 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
          >
            {t('haveAccount')}
          </Link>
        </div>

        <SafetyBanner variant="compact" className="mt-10 max-w-md text-white/40" />
      </div>
    </section>
  );
}
