import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LandingNav } from '@/components/landing/landing-nav';
import { PricingSection4, type PricingPlanView } from '@/components/ui/pricing-section-4';
import { SafetyBanner } from '@/components/safety-banner';
import { PLANS } from '@/lib/plans';

type PricingPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PricingPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Pricing' });

  return {
    title: t('metadataTitle'),
    description: t('metadataDescription'),
  };
}

export default async function PricingPage({ params }: PricingPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, footer] = await Promise.all([getTranslations('Pricing'), getTranslations('Footer')]);

  const plans: PricingPlanView[] = [
    {
      id: 'free',
      name: t(`plans.${PLANS.FREE.nameKey}.name`),
      description: t('plans.free.description'),
      monthlyPrice: PLANS.FREE.priceUsdCents / 100,
      yearlyPrice: null,
      features: PLANS.FREE.featureKeys.map((key) => t(`plans.features.${key}`)),
      cta: t('plans.free.cta'),
      href: '/register',
      featured: false,
    },
    {
      id: 'plus',
      name: t(`plans.${PLANS.PLUS_MONTHLY.nameKey}.name`),
      description: t('plans.plus.description'),
      monthlyPrice: PLANS.PLUS_MONTHLY.priceUsdCents / 100,
      yearlyPrice: PLANS.PLUS_YEARLY.priceUsdCents / 100,
      features: PLANS.PLUS_MONTHLY.featureKeys.map((key) => t(`plans.features.${key}`)),
      cta: t('plans.plus.cta'),
      href: '/register',
      featured: true,
    },
    {
      id: 'pro',
      name: t(`plans.${PLANS.PRO_MONTHLY.nameKey}.name`),
      description: t('plans.pro.description'),
      monthlyPrice: PLANS.PRO_MONTHLY.priceUsdCents / 100,
      yearlyPrice: null,
      features: PLANS.PRO_MONTHLY.featureKeys.map((key) => t(`plans.features.${key}`)),
      cta: t('plans.pro.cta'),
      href: '/register',
      featured: false,
    },
  ];

  const annualSavingsPercent = Math.round(
    (1 - PLANS.PLUS_YEARLY.priceUsdCents / (PLANS.PLUS_MONTHLY.priceUsdCents * 12)) * 100,
  );

  return (
    <div className="min-h-screen bg-abyss">
      <LandingNav />
      <main>
        <PricingSection4
          locale={locale}
          plans={plans}
          copy={{
            eyebrow: t('eyebrow'),
            title: t('title'),
            subtitle: t('subtitle'),
            billingToggleLabel: t('billingToggleLabel'),
            monthly: t('monthly'),
            yearly: t('yearly'),
            save: t('save', { percent: annualSavingsPercent }),
            mostPopular: t('mostPopular'),
            plansHeading: t('plansHeading'),
            included: t('included'),
            perMonth: t('perMonth'),
            perYear: t('perYear'),
            forever: t('forever'),
            monthlyOnly: t('monthlyOnly'),
            checkoutNote: t('checkoutNote'),
          }}
        />
        <div className="border-t border-white/10 bg-abyss px-6 py-6 sm:px-8">
          <SafetyBanner
            variant="banner"
            className="mx-auto max-w-5xl border-white/10 bg-white/5 py-3 text-center text-white/55"
          />
        </div>
      </main>
      <footer className="bg-abyss px-6 pb-10 pt-4 sm:px-8">
        <p className="text-center text-xs text-white/55">
          {footer('copyright', { year: new Date().getFullYear() })}
        </p>
      </footer>
    </div>
  );
}
