'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SafetyBanner } from '@/components/safety-banner';
import { SYMPTOM_SET } from '@/lib/symptoms';

/**
 * Symptom entry form (GOLD §5.10 / spec SE-1, SE-4).
 *
 * Creates SymptomEntry rows via POST /dashboard/symptoms/save. The symptom
 * dropdown is bound to the fixed SYMPTOM_SET and the score is a 0–10 slider;
 * the server re-validates both (defense-in-depth). The §2.5 SafetyBanner is
 * rendered on this clinical surface (SRV-1 / SE-4).
 */
const schema = z.object({
  date: z.string().min(1, 'required'),
  symptom: z.enum([...SYMPTOM_SET] as [string, ...string[]]),
  score: z.number().int().min(0).max(10),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/** Symptom machine key → its translation key under Dashboard.Symptoms. */
const SYMPTOM_LABEL_KEY: Record<string, string> = {
  energy: 'symptomEnergy',
  mood: 'symptomMood',
  libido: 'symptomLibido',
  sleep: 'symptomSleep',
  recovery: 'symptomRecovery',
};

export function SymptomEntryForm() {
  const router = useRouter();
  const t = useTranslations('Dashboard.Symptoms');
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: '', symptom: 'energy', score: 5 },
  });

  const score = watch('score');

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const res = await fetch('/dashboard/symptoms/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setServerError(t('saveFailed'));
      return;
    }
    reset({ date: '', symptom: values.symptom, score: 5 });
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <SafetyBanner />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">
            {t('date')} <span className="text-destructive">*</span>
          </Label>
          <Input id="date" type="date" {...register('date')} aria-invalid={!!errors.date} />
          {errors.date && <p className="text-xs text-destructive">{t('dateRequired')}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="symptom">{t('symptom')}</Label>
          {/* Native select bound to the fixed §5.10 set (no shadcn Select yet). */}
          <select
            id="symptom"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            {...register('symptom')}
          >
            {SYMPTOM_SET.map((s) => (
              <option key={s} value={s}>
                {t(SYMPTOM_LABEL_KEY[s] as never)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="score">
          {t('score')}: <span className="font-semibold">{String(score ?? 5)}</span>
        </Label>
        {/* 0–10 ordinal slider; valueAsNumber so the schema gets a number. */}
        <input
          id="score"
          type="range"
          min={0}
          max={10}
          step={1}
          className="w-full accent-primary"
          {...register('score', { valueAsNumber: true })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">{t('note')}</Label>
        <Input id="note" {...register('note')} />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
