import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';

import '../globals.css';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from '@/components/theme-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Footer' });
  return {
    title: 'TRT Clinical Decision Support Dashboard',
    description: t('copyright', { year: new Date().getFullYear() }),
    // Declaring the icon explicitly stops the browser's implicit `/favicon.ico`
    // probe, which 404s — the repo ships an SVG mark, not an .ico. Same asset
    // backs `theme.logo` in `@/lib/auth`.
    icons: { icon: '/icon.svg' },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans">
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="America/Argentina/Buenos_Aires"
          now={new Date()}
        >
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
