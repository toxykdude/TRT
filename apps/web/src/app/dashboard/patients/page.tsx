import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SafetyBanner } from '@/components/safety-banner';
import { ProfileForm } from '@/components/dashboard/profile-form';

export default async function PatientsPage() {
  const session = await auth();
  const db = prismaFor(session!.user.id);
  const patient = await db.patient.findUnique({ where: { ownerId: session!.user.id } });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Patient profile</h1>
        <p className="text-sm text-muted-foreground">
          Your baseline data. Used only to give context to your labs.
        </p>
      </div>

      <SafetyBanner />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Demographics, vitals, lifestyle, and history (GOLD §5.4).</CardDescription>
        </CardHeader>
        <CardContent>
          {patient ? (
            <ProfileForm patient={patient} />
          ) : (
            <p className="text-sm text-muted-foreground">No profile yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
