'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Patient = {
  id: string;
  dateOfBirth: Date | null;
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  restingHeartRate: number | null;
  sleepHoursPerNight: number | null;
  exerciseFrequency: string | null;
  alcoholUse: string | null;
  smokingStatus: string | null;
  medicalConditions: string | null;
  supplements: string | null;
  goals: string | null;
  familyHistory: string | null;
};

function f(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}
function d(v: Date | null | undefined): string {
  if (!v) return '';
  return new Date(v).toISOString().slice(0, 10);
}

const NUM_FIELDS: { key: keyof Patient; label: string }[] = [
  { key: 'heightCm', label: 'Height (cm)' },
  { key: 'weightKg', label: 'Weight (kg)' },
  { key: 'bodyFatPct', label: 'Body fat (%)' },
  { key: 'waistCm', label: 'Waist (cm)' },
  { key: 'bloodPressureSystolic', label: 'BP systolic' },
  { key: 'bloodPressureDiastolic', label: 'BP diastolic' },
  { key: 'restingHeartRate', label: 'Resting HR' },
  { key: 'sleepHoursPerNight', label: 'Sleep (h/night)' },
];

const TEXT_FIELDS: { key: keyof Patient; label: string }[] = [
  { key: 'exerciseFrequency', label: 'Exercise frequency' },
  { key: 'alcoholUse', label: 'Alcohol use' },
  { key: 'smokingStatus', label: 'Smoking status' },
  { key: 'medicalConditions', label: 'Medical conditions' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'goals', label: 'Goals' },
  { key: 'familyHistory', label: 'Family history' },
];

export function ProfileForm({ patient }: { patient: Patient }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const field of NUM_FIELDS) {
      const v = fd.get(field.key as string);
      body[field.key] = v === '' ? null : Number(v);
    }
    for (const field of TEXT_FIELDS) {
      body[field.key] = String(fd.get(field.key as string) ?? '') || null;
    }
    const dob = fd.get('dateOfBirth');
    body.dateOfBirth = dob === '' ? null : dob;
    body.sex = String(fd.get('sex') ?? '') || null;

    const res = await fetch('/dashboard/patients/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setDone(true);
      router.refresh();
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={d(patient.dateOfBirth)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sex">Sex</Label>
          <Input id="sex" name="sex" defaultValue={patient.sex ?? ''} placeholder="male / female / intersex" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {NUM_FIELDS.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key as string}>{field.label}</Label>
            <Input
              id={field.key as string}
              name={field.key as string}
              type="number"
              step="any"
              defaultValue={f(patient[field.key] as number | null)}
            />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key as string}>{field.label}</Label>
            <Input id={field.key as string} name={field.key as string} defaultValue={(patient[field.key] as string) ?? ''} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save profile
        </Button>
        {done && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>
    </form>
  );
}
