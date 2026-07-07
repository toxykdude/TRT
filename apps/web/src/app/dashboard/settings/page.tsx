import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { ThemeToggle } from '@/components/theme-toggle';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';

export default async function SettingsPage() {
  const session = await auth();
  const db = prismaFor(session!.user.id);
  const auditCount = await db.auditLog.count();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Account, appearance, and data controls.</p>
      </div>

      <SafetyBanner />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Switch between light and dark mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Signed in as {session?.user.email}. {auditCount} audited action(s) on record.
          </CardDescription>
        </CardHeader>
      </Card>

      <PlaceholderCard
        title="Data export & deletion — coming next"
        what="Right-to-be-forgotten and full data export (GOLD §8) are part of the next pass. Until then, contact your administrator to export or delete your data."
        next="One-click JSON export and verified account deletion that purges all patient data."
      />
    </div>
  );
}
