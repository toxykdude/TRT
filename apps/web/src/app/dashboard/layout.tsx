import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { SafetyBanner } from '@/components/safety-banner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  // Ensure the user has a Patient record (one-per-user in this pass).
  const db = prismaFor(session.user.id);
  await db.patient.upsert({
    where: { ownerId: session.user.id },
    update: {},
    create: { ownerId: session.user.id },
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
          <div className="ml-auto text-sm text-muted-foreground">
            {session.user.name || session.user.email}
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
