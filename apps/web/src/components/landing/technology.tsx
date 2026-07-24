import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { ProductMockup } from '@/components/landing/product-mockup';

const CAPABILITIES = [
  'AI extraction from lab PDFs — uncertain values flagged for review',
  'Per-lab reference ranges and unit normalization, never global ranges',
  'Deterministic clinical rules engine — reproducible, auditable output',
] as const;

/**
 * Technology applications — two-column split (visual | content), collapsing
 * to a single column below `md`.
 */
export function Technology() {
  return (
    <section id="technology" className="bg-[#F8F9FA] py-24 dark:bg-muted/20 sm:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 sm:px-8 md:grid-cols-2">
        {/* Left: product visual */}
        <div>
          <ProductMockup />
          <p className="mt-4 text-center text-xs text-gray-400 dark:text-muted-foreground">
            Illustrative demo data — not medical advice.
          </p>
        </div>

        {/* Right: content */}
        <div>
          <span className="mb-4 inline-block rounded-full border border-mint/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-mint-dark dark:text-mint">
            Technology applications
          </span>
          <h2 className="mb-6 text-3xl font-bold tracking-tight text-charcoal dark:text-foreground sm:text-4xl">
            The Endocrine Picture: Implications for Health
          </h2>
          <p className="text-lg leading-relaxed text-gray-600 dark:text-muted-foreground">
            Hormones influence nearly every dimension of health — energy, body composition, mood,
            cognition, longevity. Yet the data lives scattered across PDFs, portals, and
            spreadsheets. TRT Insights pairs AI-powered extraction with a deterministic rules
            engine to normalize every biomarker, track it against its lab-specific reference
            range, and surface the trends that matter. The implications are global:
            better-prepared patients, better-informed clinicians, and a higher standard for
            precision hormone care.
          </p>

          <ul className="mt-6 space-y-2.5">
            {CAPABILITIES.map((capability) => (
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
            Explore the platform
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
