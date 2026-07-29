import Image from 'next/image';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  Activity,
  Zap,
  Brain,
  Dumbbell,
  HeartPulse,
  ShieldCheck,
  Lock,
  FileCheck,
  UserRound,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { SafetyBanner } from '@/components/safety-banner';
import { LanguageToggle } from '@/components/language-toggle';

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Auth.Layout');

  const features = [
    { key: 'energy', icon: Zap },
    { key: 'clarity', icon: Brain },
    { key: 'muscle', icon: Dumbbell },
    { key: 'aging', icon: HeartPulse },
  ] as const;

  const badges = [
    { key: 'physician', icon: ShieldCheck },
    { key: 'secure', icon: Lock },
    { key: 'hipaa', icon: FileCheck },
    { key: 'personalized', icon: UserRound },
  ] as const;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* promo side */}
      <div className="relative hidden overflow-hidden bg-[#05070A] lg:flex lg:flex-col">
        {/* decorative atmosphere */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full bg-[#22D3EE]/15 blur-[120px]" />
          <div className="absolute bottom-0 left-0 h-[420px] w-[420px] rounded-full bg-[#3B82F6]/10 blur-[100px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(203,213,225,0.07)_1px,transparent_0)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />
        </div>

        {/* molecule hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[18%] top-[4%] w-[75%] select-none"
        >
          <Image
            src="/testo-molecule.png"
            alt=""
            width={800}
            height={549}
            priority
            className="h-auto w-full drop-shadow-[0_0_80px_rgba(34,211,238,0.25)]"
          />
        </div>

        {/* content */}
        <div className="relative z-10 flex flex-1 flex-col justify-between gap-10 p-12 xl:p-16">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            {t('kicker')}
          </p>

          <div className="max-w-lg space-y-8">
            <p className="text-4xl font-semibold tracking-tight text-white xl:text-5xl xl:leading-[1.05]">
              <span className="block">{t('headlineLine1')}</span>
              <span className="block bg-gradient-to-r from-[#3B82F6] to-[#22D3EE] bg-clip-text text-transparent">
                {t('headlineLine2')}
              </span>
            </p>
            <p className="text-base leading-relaxed text-slate-300">{t('subheadline')}</p>

            <div className="grid grid-cols-2 gap-4">
              {features.map(({ key, icon: Icon }) => (
                <div
                  key={key}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                >
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[#22D3EE]/10 text-[#22D3EE]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium text-white">{t(`features.${key}.title`)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {t(`features.${key}.body`)}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-[11px] italic text-slate-500">{t('featuresFootnote')}</p>
          </div>

          <div className="max-w-lg space-y-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <p className="text-sm font-semibold text-white">{t('trust.title')}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{t('trust.body')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {badges.map(({ key, icon: Icon }) => (
                <span key={key} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Icon className="h-3.5 w-3.5" />
                  {t(`badges.${key}`)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* form side */}
      <div className="flex flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Activity className="h-5 w-5 text-primary" />
              TRT Insights
            </Link>
            <LanguageToggle />
          </div>
          {children}
          <div className="mt-8">
            <SafetyBanner variant="compact" />
          </div>
        </div>
      </div>
    </div>
  );
}
