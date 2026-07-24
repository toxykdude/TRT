// Minimal root layout. The real <html>/<body> root lives at
// `[locale]/layout.tsx`; this passthrough exists only because Next.js
// requires a root layout when `app/not-found.tsx` is present.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
