'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PasswordInputProps = {
  id: string;
  name: string;
  label: string;
  autoComplete: 'new-password' | 'current-password';
  required?: boolean;
  minLength?: number;
  hint?: string;
  /** Optional controlled value/onChange — used by reset-password-form.tsx to
   *  drive the live mismatch check. Omit both for plain uncontrolled use
   *  (signup, login), where the server reads the value straight off FormData. */
  value?: string;
  onChange?: (value: string) => void;
};

/**
 * Reusable password field with a show/hide toggle. This is the ONLY reason
 * login doesn't need a "confirm password" field: a typo is recoverable by
 * just looking at what was typed, so the added friction of double entry only
 * belongs on the reset step (see reset-password-form.tsx).
 *
 * Accessibility, non-negotiable on an auth surface:
 * - the toggle is a real `<button type="button">`, never a `<div>`, so it
 *   can't accidentally submit the form;
 * - `aria-pressed` + an `aria-label` that flips between show/hide give
 *   screen readers the current state, not just an icon;
 * - it sits right after the input in DOM order, so Tab moves
 *   input -> toggle -> next field, never trapping keyboard users between
 *   the two;
 * - `autoComplete` is passed straight through untouched so password managers
 *   keep working.
 */
export function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  required,
  minLength,
  hint,
  value,
  onChange,
}: PasswordInputProps) {
  const t = useTranslations('Auth.PasswordToggle');
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? t('hide') : t('show')}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
