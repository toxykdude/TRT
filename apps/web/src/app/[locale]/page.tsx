import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LandingNav } from '@/components/landing/landing-nav';
import { Hero } from '@/components/landing/hero';
import { Overview } from '@/components/landing/overview';
import { Technology } from '@/components/landing/technology';
import { Research } from '@/components/landing/research';
import { SafetyBanner } from '@/components/safety-banner';

/**
 * Landing page — BiomeSense-inspired redesign:
 * dark cellular hero + mint accent, light alternating content sections,
 * always-dark footer. The clinical disclaimer (GOLD §2) stays in the hero
 * and footer.
 */
export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Footer');

  return (
    <div className="min-h-screen">
      {/* Nav is absolutely positioned over the dark hero */}
      <div className="relative">
        <LandingNav />
        <Hero />
      </div>

      <main>
        <Overview />
        <Technology />
        <Research />
      </main>

      {/* Fixed-dark footer (brand bookend) with mandatory disclaimer */}
      <footer className="bg-abyss py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-6 sm:px-8 lg:flex-row lg:justify-between">
          <p className="text-center text-xs text-white/50 lg:text-left">
            {t('copyright', { year: new Date().getFullYear() })}
          </p>
          <SafetyBanner
            variant="footer"
            className="max-w-2xl text-center text-white/40 lg:text-right"
          />
        </div>
      </footer>
    </div>
  );
}
