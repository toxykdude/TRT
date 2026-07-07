import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Password reset is a roadmap item (needs email transport). This page records
// the intent honestly rather than faking it.
export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Password reset emails aren&apos;t enabled yet in this build. Contact your administrator to
          reset, or create a new account.
        </p>
      </div>
      <div className="space-y-4 opacity-60" aria-disabled>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" disabled />
        </div>
        <Button type="button" disabled className="w-full">
          Send reset link (coming soon)
        </Button>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
