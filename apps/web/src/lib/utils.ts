import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware class merge (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The mandatory clinical disclaimer (GOLD §2.5) — single source. */
export const SAFETY_DISCLAIMER =
  'This software provides educational and organizational support only. It does not ' +
  'diagnose medical conditions or prescribe treatment. All treatment decisions must ' +
  'be made by a qualified healthcare professional.';

/** Format an ISO/date as a short readable date. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
