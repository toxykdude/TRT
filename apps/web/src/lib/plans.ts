/**
 * Plan catalog (company_implementation.md §5) — code-defined, no Plan table.
 *
 * Providers: Wompi (COP, Colombia) and PayPal (USD, international).
 * The Free tier exists for SEO capture and the gym beta funnel; paid tiers
 * meter uploads per calendar month; reports are unmetered on paid tiers.
 */

export type PlanCode = 'FREE' | 'PLUS_MONTHLY' | 'PLUS_YEARLY' | 'PRO_MONTHLY';

export type PlanInterval = 'month' | 'year';

export type PlanDefinition = {
  code: PlanCode;
  /** i18n key suffix under the Pricing namespace */
  nameKey: string;
  /** USD price in cents (PayPal). 0 for FREE. */
  priceUsdCents: number;
  /** COP price in cents (Wompi). 0 for FREE. */
  priceCopCents: number;
  interval: PlanInterval | null;
  quotas: {
    /** PDF uploads per calendar month. 0 = manual entry only. -1 = unlimited. */
    uploadsPerMonth: number;
    /** Reports per calendar quarter. -1 = unlimited (paid tiers). */
    reportsPerQuarter: number;
    /** Biomarkers in trend views. -1 = all. */
    trendBiomarkers: number;
  };
  /** feature bullet i18n keys under Pricing.plans.* */
  featureKeys: string[];
};

export const PLANS: Record<PlanCode, PlanDefinition> = {
  FREE: {
    code: 'FREE',
    nameKey: 'free',
    priceUsdCents: 0,
    priceCopCents: 0,
    interval: null,
    quotas: { uploadsPerMonth: 0, reportsPerQuarter: 1, trendBiomarkers: 3 },
    featureKeys: ['manualEntry', 'trends3', 'reportQuarter'],
  },
  PLUS_MONTHLY: {
    code: 'PLUS_MONTHLY',
    nameKey: 'plus',
    priceUsdCents: 1499, // $14.99/mo
    priceCopCents: 62_000_00, // $62.000 COP/mo
    interval: 'month',
    quotas: { uploadsPerMonth: 10, reportsPerQuarter: -1, trendBiomarkers: -1 },
    featureKeys: ['uploads10', 'trendsFull', 'reportsUnlimited', 'symptoms', 'export'],
  },
  PLUS_YEARLY: {
    code: 'PLUS_YEARLY',
    nameKey: 'plus',
    priceUsdCents: 11_900, // $119/yr (~34% discount)
    priceCopCents: 490_000_00, // $490.000 COP/yr
    interval: 'year',
    quotas: { uploadsPerMonth: 10, reportsPerQuarter: -1, trendBiomarkers: -1 },
    featureKeys: ['uploads10', 'trendsFull', 'reportsUnlimited', 'symptoms', 'export'],
  },
  PRO_MONTHLY: {
    code: 'PRO_MONTHLY',
    nameKey: 'pro',
    priceUsdCents: 9_900, // $99/mo per seat
    priceCopCents: 410_000_00, // $410.000 COP/mo
    interval: 'month',
    quotas: { uploadsPerMonth: 50, reportsPerQuarter: -1, trendBiomarkers: -1 },
    featureKeys: ['uploads50', 'everythingPlus', 'multiPatient', 'prepVisit', 'referenceModule'],
  },
};

export const PAID_PLAN_CODES = ['PLUS_MONTHLY', 'PLUS_YEARLY', 'PRO_MONTHLY'] as const;
export type PaidPlanCode = (typeof PAID_PLAN_CODES)[number];

export function isPaidPlan(code: string): code is PaidPlanCode {
  return (PAID_PLAN_CODES as readonly string[]).includes(code);
}

export function isProPlan(code: PlanCode): boolean {
  return code === 'PRO_MONTHLY';
}

/** Format cents as a display price (es-CO for COP, en-US for USD). */
export function formatPrice(cents: number, currency: 'USD' | 'COP', locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-CO' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(cents / 100);
}
