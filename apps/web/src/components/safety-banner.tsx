import { ShieldAlert } from 'lucide-react';
import { SAFETY_DISCLAIMER, cn } from '@/lib/utils';

/**
 * The mandatory clinical disclaimer banner (GOLD §2.5).
 * Must appear on every clinical surface. Two variants:
 *   • "full"   — the complete banner with icon, for dashboard/report pages
 *   • "compact"— single line, for tight bars/footers
 */
export function SafetyBanner({ variant = 'full', className }: { variant?: 'full' | 'compact'; className?: string }) {
  if (variant === 'compact') {
    return (
      <p className={cn('text-[11px] leading-tight text-muted-foreground', className)}>{SAFETY_DISCLAIMER}</p>
    );
  }
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm',
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
      <p className="text-foreground/80">{SAFETY_DISCLAIMER}</p>
    </div>
  );
}
