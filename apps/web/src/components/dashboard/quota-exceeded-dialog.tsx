'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type QuotaPayload = {
  error: 'quota_exceeded';
  kind: string;
  plan: string;
  used: number;
  limit: number;
  period: string;
  upgradeUrl: string;
};

export function QuotaExceededDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: QuotaPayload | null;
}) {
  const t = useTranslations('Dashboard.Reports');

  if (!payload) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <DialogTitle>{t('quotaTitle')}</DialogTitle>
          </div>
          <DialogDescription>
            {t('quotaDescription', { limit: payload.limit, period: payload.period })}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t('quotaUsed', { used: payload.used, limit: payload.limit })}
        </p>

        <DialogFooter className="gap-2 sm:gap-2 sm:space-x-0">
          <Button asChild>
            <Link href={payload.upgradeUrl}>{t('upgradeCta')}</Link>
          </Button>
          <DialogClose asChild>
            <Button variant="outline">{t('close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
