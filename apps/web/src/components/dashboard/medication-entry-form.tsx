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

/**
 * Medication entry form (GOLD §5.11 / spec ME-1..ME-5).
 *
 * Creates Medication rows via POST /dashboard/medications/save. `dose` is a
 * CAPTURE-ONLY historical record (§5.11): it is stored, shown NOWHERE on a
 * consumer surface, and never an input to recommendations — the explicit hint
 * below states this so the user understands why it is collected. The §2.5
 * SafetyBanner is rendered on this clinical surface (SRV-1 / ME-5).
 */
const schema = z
  .object({
    name: z.string().trim().min(1, 'required'),
    route: z.string().optional(),
    frequency: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    reason: z.string().optional(),
    clinician: z.string().optional(),
    dose: z.string().optional(),
  })
  .refine(
    (d) => !(d.startDate && d.endDate && new Date(d.startDate) > new Date(d.endDate)),
    { message: 'endDate must be on or after startDate', path: ['endDate'] },
  );

type FormValues = z.infer<typeof schema>;

export function MedicationEntryForm() {
  const router = useRouter();
  const t = useTranslations('Dashboard.Medications');
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: {} });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const res = await fetch('/dashboard/medications/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setServerError(t('saveFailed'));
      return;
    }
    reset();
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <SafetyBanner />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">
            {t('name')} <span className="text-destructive">*</span>
          </Label>
          <Input id="name" placeholder={t('namePlaceholder')} {...register('name')} aria-invalid={!!errors.name} />
          {errors.name && <p className="text-xs text-destructive">{t('nameRequired')}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="startDate">{t('startDate')}</Label>
          <Input id="startDate" type="date" {...register('startDate')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">{t('endDate')}</Label>
          <Input id="endDate" type="date" {...register('endDate')} aria-invalid={!!errors.endDate} />
          {errors.endDate && <p className="text-xs text-destructive">{t('datesInvalid')}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="route">{t('route')}</Label>
          <Input id="route" {...register('route')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="frequency">{t('frequency')}</Label>
          <Input id="frequency" {...register('frequency')} />
        </div>

        {/* Dose is capture-only — stored per §5.11, displayed NOWHERE consumer-bound. */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="dose">{t('dose')}</Label>
          <Input id="dose" {...register('dose')} aria-describedby="dose-hint" />
          <p id="dose-hint" className="text-xs text-muted-foreground">
            {t('doseHint')}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">{t('reason')}</Label>
          <Input id="reason" {...register('reason')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clinician">{t('clinician')}</Label>
          <Input id="clinician" {...register('clinician')} />
        </div>
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
