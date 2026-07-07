import Link from 'next/link';
import { Activity } from 'lucide-react';
import { SafetyBanner } from '@/components/safety-banner';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* form side */}
      <div className="flex flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            TRT Insights
          </Link>
          {children}
          <div className="mt-8">
            <SafetyBanner variant="compact" />
          </div>
        </div>
      </div>
      {/* ambient side */}
      <div className="relative hidden overflow-hidden bg-secondary lg:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_50%,hsl(var(--primary)/0.15),transparent_70%)]"
        />
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <blockquote className="max-w-md text-balance text-lg text-muted-foreground">
            “A structured, longitudinal view of your labs — so the time with your doctor goes to
            decisions, not deciphering PDFs.”
          </blockquote>
        </div>
      </div>
    </div>
  );
}
