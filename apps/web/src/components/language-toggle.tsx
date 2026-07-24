'use client';

import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * ES ⇄ EN language switch. Mirrors `ThemeToggle` (shadcn outline icon button)
 * so the two toggles read as a matched pair in the header/auth surfaces.
 * The label shows the language the user will switch *to*.
 */
export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const next = locale === 'es' ? 'en' : 'es';

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={next === 'es' ? 'Cambiar a español' : 'Switch to English'}
      onClick={() => router.replace(pathname, { locale: next })}
    >
      <span className="text-xs font-bold uppercase">{next}</span>
    </Button>
  );
}
