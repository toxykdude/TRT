import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { SafetyBanner } from '@/components/safety-banner';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect({ href: '/login', locale });
    throw new Error('unreachable'); // redirect() throws at runtime
  }

  // Ensure the user has a Patient record (one-per-user in this pass).
  const db = prismaFor(userId);
  await db.patient.upsert({
    where: { ownerId: userId },
    update: {},
    create: { ownerId: userId },
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl lg:px-8">
          <div className="lg:hidden">
            <MobileNav />
          </div>
          <div className="hidden flex-1 lg:block">
            <SafetyBanner variant="compact" className="max-w-4xl" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {session?.user?.name || session?.user?.email}
            </span>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
