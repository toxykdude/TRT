'use client';

import { useTranslations } from 'next-intl';
import { CtaButton } from '@/components/landing/cta-button';

/** Research / footer teaser — centered statement section. */
export function Research() {
  const t = useTranslations('Research');
  const tc = useTranslations('Common');

  return (
    <section id="research" className="bg-white py-24 dark:bg-background sm:py-32">
      <div className="mx-auto flex max-w-7xl flex-col items-center px-6 text-center sm:px-8">
        <p className="mb-4 text-sm uppercase tracking-[0.25em] text-gray-500 dark:text-muted-foreground">
          {t('eyebrow')}
        </p>
        <h2 className="max-w-3xl text-4xl font-medium tracking-tight text-charcoal dark:text-foreground sm:text-5xl">
          {t('title')}
        </h2>
        <CtaButton href="/register" className="mt-10">
          {tc('getStarted')}
        </CtaButton>
      </div>
    </section>
  );
}
