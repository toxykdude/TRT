'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, Check } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ProductMockup } from '@/components/landing/product-mockup';

/**
 * Technology applications — two-column split (visual | content), collapsing
 * to a single column below `md`.
 */
export function Technology() {
  const t = useTranslations('Technology');
  const capabilities = t.raw('capabilities') as string[];

  return (
    <section id="technology" className="bg-[#F8F9FA] py-24 dark:bg-muted/20 sm:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 sm:px-8 md:grid-cols-2">
        {/* Left: product visual */}
        <div>
          <ProductMockup />
          <p className="mt-4 text-center text-xs text-gray-400 dark:text-muted-foreground">
            {t('demoCaption')}
          </p>
        </div>

        {/* Right: content */}
        <div>
          <span className="mb-4 inline-block rounded-full border border-mint/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-mint-dark dark:text-mint">
            {t('badge')}
          </span>
          <h2 className="mb-6 text-3xl font-bold tracking-tight text-charcoal dark:text-foreground sm:text-4xl">
            {t('title')}
          </h2>
          <p className="text-lg leading-relaxed text-gray-600 dark:text-muted-foreground">
            {t('body')}
          </p>

          <ul className="mt-6 space-y-2.5">
            {capabilities.map((capability) => (
              <li
                key={capability}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-700 dark:text-foreground/80"
              >
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-mint-dark dark:text-mint"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
                {capability}
              </li>
            ))}
          </ul>

          <Link
            href="/register"
            className="group mt-8 inline-flex items-center gap-2 rounded-sm text-sm font-bold uppercase tracking-wide text-mint-dark transition-colors duration-200 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-dark/60 dark:text-mint dark:hover:text-mint/80"
          >
            {t('explore')}
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
