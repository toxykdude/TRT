import { SAFETY_DISCLAIMER, cn } from '@/lib/utils';

/**
 * The clinical disclaimer. Kept on every clinical surface (legal protection);
 * rendered subtly so it doesn't dominate the UX.
 *
 * Variants:
 *   • "banner"  — compact amber-tinted strip (dashboard pages)
 *   • "footer"  — single muted line (report footers)
 *   • "compact" — tiny text (tight bars)
 */
export function SafetyBanner({
  variant = 'banner',
  className,
}: {
  variant?: 'banner' | 'footer' | 'compact';
  className?: string;
}) {
  if (variant === 'compact') {
    return <p className={cn('text-[11px] leading-tight text-muted-foreground', className)}>{SAFETY_DISCLAIMER}</p>;
  }
  if (variant === 'footer') {
    return <p className={cn('text-xs text-muted-foreground/70', className)}>{SAFETY_DISCLAIMER}</p>;
  }
  // banner: subtle, not alarming
  return (
    <p
      className={cn(
        'rounded-md border border-border/50 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      {SAFETY_DISCLAIMER}
    </p>
  );
}
