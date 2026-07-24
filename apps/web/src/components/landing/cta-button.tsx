import { Link } from '@/i18n/navigation';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Primary landing CTA — mint pill with a circular arrow affordance.
 * Used for every top-level conversion action on the landing page.
 */
export function CtaButton({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full bg-mint px-6 py-3',
        'text-sm font-bold uppercase tracking-wide text-charcoal',
        'shadow-[0_0_28px_rgba(0,230,161,0.35)]',
        'transition-all duration-200 hover:scale-[1.04] hover:brightness-105',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-abyss',
        className,
      )}
    >
      {children}
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-charcoal/15 transition-transform duration-200 group-hover:translate-x-0.5">
        <ArrowRight className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      </span>
    </Link>
  );
}
