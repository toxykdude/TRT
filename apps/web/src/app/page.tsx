import Link from 'next/link';
import {
  Activity,
  FileText,
  LineChart,
  Lock,
  Moon,
  ScanLine,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SafetyBanner } from '@/components/safety-banner';

const FEATURES = [
  { icon: Clock, title: 'Timeline Analysis', desc: 'Every lab, symptom, and protocol on one interactive timeline.' },
  { icon: ScanLine, title: 'AI Lab Extraction', desc: 'Pull every biomarker from your PDFs — normalized and dated.' },
  { icon: LineChart, title: 'Hormone Trends', desc: 'See how your values move over time, against reference ranges.' },
  { icon: FileText, title: 'Clinical Reports', desc: 'Physician-ready summaries for your next appointment.' },
  { icon: Lock, title: 'Secure Data', desc: 'Row-level isolated, encrypted, audit-logged by design.' },
  { icon: Moon, title: 'Dark Mode', desc: 'A polished, accessible experience, day or night.' },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ambient gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.18),transparent_70%)]"
      />

      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-semibold">
          <Activity className="h-5 w-5 text-primary" />
          <span>TRT Insights</span>
        </div>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center sm:pt-24">
        <div className="animate-fade-up">
          <span className="inline-flex items-center rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            Evidence-based · Clinician-reviewed · Not a prescribing tool
          </span>
        </div>
        <h1 className="mt-6 animate-fade-up text-4xl font-bold tracking-tight sm:text-6xl">
          Understand Your Hormone Health with{' '}
          <span className="bg-gradient-to-r from-primary to-sky-400 bg-clip-text text-transparent">
            Evidence-Based Clinical Insights
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg text-muted-foreground">
          Upload your laboratory history and receive a structured clinical summary to support
          informed discussions with your healthcare provider.
        </p>
        <div className="mt-8 flex animate-fade-up items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/register">
              Upload Labs <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">I already have an account</Link>
          </Button>
        </div>
        <div className="mx-auto mt-10 max-w-2xl">
          <SafetyBanner variant="compact" />
        </div>
      </section>

      {/* feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glass group rounded-xl p-6 transition-transform duration-300 hover:-translate-y-1"
            >
              <f.icon className="mb-4 h-6 w-6 text-primary" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="mx-auto max-w-6xl px-6 py-12">
        <SafetyBanner />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} TRT Insights · Clinical decision support, not a medical device.
        </p>
      </footer>
    </div>
  );
}
