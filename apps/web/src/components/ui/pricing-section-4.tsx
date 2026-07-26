'use client';

import { useState } from 'react';
import NumberFlow from '@number-flow/react';
import { Check } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from '@/components/ui/sparkles';
import { TimelineAnimation } from '@/components/ui/timeline-animation';
import { VerticalCutReveal } from '@/components/ui/vertical-cut-reveal';
import { cn } from '@/lib/utils';

export type PricingPlanView = {
  id: 'free' | 'plus' | 'pro';
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number | null;
  features: string[];
  cta: string;
  href: string;
  featured: boolean;
};

export type PricingSectionCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  billingToggleLabel: string;
  monthly: string;
  yearly: string;
  save: string;
  mostPopular: string;
  plansHeading: string;
  included: string;
  perMonth: string;
  perYear: string;
  forever: string;
  monthlyOnly: string;
  checkoutNote: string;
};

type PricingSectionProps = {
  locale: string;
  plans: PricingPlanView[];
  copy: PricingSectionCopy;
};

export function PricingSection4({ locale, plans, copy }: PricingSectionProps) {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const shouldReduceMotion = useReducedMotion();
  const numberLocale = locale === 'es' ? 'es-CO' : 'en-US';

  return (
    <section
      id="pricing"
      className="relative isolate overflow-hidden bg-abyss px-6 pb-24 pt-36 sm:px-8 sm:pb-32 sm:pt-44"
    >
      <Sparkles className="opacity-70" />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(0,230,161,0.17),transparent_38%),radial-gradient(circle_at_85%_42%,rgba(14,165,233,0.13),transparent_30%),linear-gradient(180deg,#011e1a_0%,#021713_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-mint/60 to-transparent"
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        <TimelineAnimation className="mx-auto max-w-4xl text-center">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.28em] text-mint">
            {copy.eyebrow}
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
            <VerticalCutReveal text={copy.title} />
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-7 text-white/60 sm:text-lg">
            {copy.subtitle}
          </p>
        </TimelineAnimation>

        <TimelineAnimation className="mt-10 flex justify-center" delay={0.08}>
          <fieldset className="rounded-full border border-white/10 bg-white/[0.06] p-1 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <legend className="sr-only">{copy.billingToggleLabel}</legend>
            <div className="flex items-center">
              {(['monthly', 'yearly'] as const).map((period) => {
                const active = billing === period;
                return (
                  <button
                    key={period}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBilling(period)}
                    className={cn(
                      'relative min-h-10 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-abyss',
                      active ? 'text-charcoal' : 'text-white/60 hover:text-white',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="pricing-billing-pill"
                        className="absolute inset-0 -z-10 rounded-full bg-mint"
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 420, damping: 34 }
                        }
                      />
                    )}
                    <span className="relative">
                      {period === 'monthly' ? copy.monthly : copy.yearly}
                      {period === 'yearly' && (
                        <span
                          className={cn('ml-2 text-xs', active ? 'text-charcoal/70' : 'text-mint')}
                        >
                          {copy.save}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </TimelineAnimation>

        <h2 className="sr-only">{copy.plansHeading}</h2>
        <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:items-stretch">
          {plans.map((plan, index) => {
            const yearlyPrice =
              plan.id === 'plus' && billing === 'yearly' ? plan.yearlyPrice : null;
            const price = yearlyPrice ?? plan.monthlyPrice;
            const interval =
              plan.id === 'free'
                ? copy.forever
                : yearlyPrice !== null
                  ? copy.perYear
                  : copy.perMonth;
            const fractionDigits = Number.isInteger(price) ? 0 : 2;

            return (
              <TimelineAnimation key={plan.id} delay={0.12 + index * 0.07} className="h-full">
                <Card
                  role="article"
                  aria-labelledby={`pricing-plan-${plan.id}`}
                  className={cn(
                    'group relative flex h-full flex-col overflow-hidden rounded-3xl border-white/10 bg-white/[0.045] text-white shadow-2xl shadow-black/20 backdrop-blur-xl transition-colors duration-300 hover:border-white/20',
                    plan.featured &&
                      'border-mint/45 bg-gradient-to-b from-mint/[0.13] to-white/[0.045] ring-1 ring-mint/20',
                  )}
                >
                  {plan.featured && (
                    <div className="absolute right-5 top-5 rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-mint">
                      {copy.mostPopular}
                    </div>
                  )}

                  <CardHeader className="space-y-5 p-7 pb-5">
                    <div className="space-y-2 pr-20">
                      <CardTitle
                        id={`pricing-plan-${plan.id}`}
                        className="text-2xl tracking-tight text-white"
                      >
                        {plan.name}
                      </CardTitle>
                      <p className="min-h-12 text-sm leading-6 text-white/55">{plan.description}</p>
                    </div>

                    <div className="flex min-h-16 items-end gap-2" aria-live="polite">
                      <NumberFlow
                        value={price}
                        locales={numberLocale}
                        format={{
                          style: 'currency',
                          currency: 'USD',
                          minimumFractionDigits: fractionDigits,
                          maximumFractionDigits: fractionDigits,
                        }}
                        className="text-5xl font-semibold tracking-[-0.055em] text-white"
                        willChange
                      />
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={interval}
                          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
                          transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                          className="pb-1.5 text-sm text-white/45"
                        >
                          {interval}
                        </motion.span>
                      </AnimatePresence>
                    </div>

                    {plan.id === 'pro' && billing === 'yearly' && (
                      <p className="text-xs font-medium text-sky-300">{copy.monthlyOnly}</p>
                    )}
                  </CardHeader>

                  <CardContent className="flex-1 px-7 pb-7 pt-2">
                    <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white/40">
                      {copy.included}
                    </p>
                    <ul className="space-y-3.5">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-3 text-sm leading-5 text-white/70">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/10 text-mint">
                            <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="p-7 pt-0">
                    <Button
                      asChild
                      size="lg"
                      variant={plan.featured ? 'default' : 'outline'}
                      className={cn(
                        'w-full rounded-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white',
                        plan.featured &&
                          'border-mint bg-mint text-charcoal hover:bg-mint/90 hover:text-charcoal',
                      )}
                    >
                      <Link href={plan.href}>{plan.cta}</Link>
                    </Button>
                  </CardFooter>
                </Card>
              </TimelineAnimation>
            );
          })}
        </div>

        <TimelineAnimation delay={0.24}>
          <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-white/40">
            {copy.checkoutNote}
          </p>
        </TimelineAnimation>
      </div>
    </section>
  );
}
