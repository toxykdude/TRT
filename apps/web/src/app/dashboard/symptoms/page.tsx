import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { SafetyBanner } from '@/components/safety-banner';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';

export default async function SymptomsPage() {
  const session = await auth();
  const db = prismaFor(session!.user.id);
  const count = await db.symptomEntry.count();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Symptoms</h1>
        <p className="text-sm text-muted-foreground">Track how you feel over time (GOLD §5.10).</p>
      </div>
      <SafetyBanner />
      <PlaceholderCard
        title={`Symptom tracking — ${count} entr${count === 1 ? 'y' : 'ies'} recorded`}
        what="The schema and storage are ready (0–10 scoring across energy, mood, libido, sleep, and more). Data entry and trend charts are part of the next pass."
        next="A daily check-in form and per-symptom trend charts overlaid with your labs."
      />
    </div>
  );
}
