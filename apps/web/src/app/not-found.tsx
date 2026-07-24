import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Global 404. Renders outside the [locale] segment, so it has no locale
// context or providers — it provides its own <html> shell and stays in
// English (a generic fallback is acceptable for Phase 1).
export default function NotFound() {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-medium text-primary">404</p>
          <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </body>
    </html>
  );
}
