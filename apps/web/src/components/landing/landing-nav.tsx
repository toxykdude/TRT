'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageToggle } from '@/components/language-toggle';

/** Section anchors rendered over the dark hero — always light-on-dark. */
const NAV_LINKS = [
  { labelKey: 'overview', href: '#overview' },
  { labelKey: 'technology', href: '#technology' },
  { labelKey: 'research', href: '#research' },
] as const;

/** Abstract geometric brand mark — teal → blue gradient (template placeholder). */
function LogoMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
      className="shrink-0 transition-transform duration-300 group-hover:rotate-[15deg]"
    >
      <defs>
        <linearGradient
          id="trt-logo-gradient"
          x1="0"
          y1="0"
          x2="26"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00E6A1" />
          <stop offset="1" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="23" height="23" rx="7" fill="url(#trt-logo-gradient)" fillOpacity="0.15" />
      <path
        d="M13 4.5 21 9v8l-8 4.5L5 17V9l8-4.5Z"
        stroke="url(#trt-logo-gradient)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="13" r="2.6" fill="url(#trt-logo-gradient)" />
    </svg>
  );
}

/**
 * Landing navigation — absolute-positioned over the dark hero, so it uses
 * fixed light-on-dark colors regardless of the active theme.
 */
export function LandingNav() {
  const t = useTranslations('Nav');
  const tc = useTranslations('Common');

  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <nav
        aria-label={t('primaryLabel')}
        className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 sm:px-8"
      >
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <LogoMark />
          <span className="whitespace-nowrap text-sm font-bold uppercase tracking-[0.18em]">
            <span className="text-white">TRT</span>{' '}
            <span className="text-gray-400 transition-colors duration-200 group-hover:text-gray-300">
              Insights
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-8">
          <ul className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-sm text-sm font-medium text-gray-400 transition-colors duration-200 hover:text-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
                >
                  {t(link.labelKey)}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-4">
            <LanguageToggle />
            <Link
              href="/login"
              className="hidden rounded-sm text-sm font-medium text-white/80 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 sm:inline-block"
            >
              {tc('signIn')}
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-mint px-4 py-2 text-sm font-bold text-charcoal transition-all duration-200 hover:scale-[1.04] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-abyss"
            >
              {tc('getStarted')}
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
