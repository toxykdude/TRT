import {
  LayoutDashboard,
  Users,
  FlaskConical,
  FileText,
  HeartPulse,
  Clock,
  BarChart3,
  Settings,
  Activity,
} from 'lucide-react';

/** Shared sidebar nav (GOLD §5.3). One source for desktop + mobile. */
export const NAV = [
  { href: '/dashboard', labelKey: 'overview', icon: LayoutDashboard },
  { href: '/dashboard/analysis', labelKey: 'analysis', icon: Activity },
  { href: '/dashboard/patients', labelKey: 'patients', icon: Users },
  { href: '/dashboard/labs', labelKey: 'labs', icon: FlaskConical },
  { href: '/dashboard/reports', labelKey: 'reports', icon: FileText },
  { href: '/dashboard/symptoms', labelKey: 'symptoms', icon: HeartPulse },
  { href: '/dashboard/timeline', labelKey: 'timeline', icon: Clock },
  { href: '/dashboard/analytics', labelKey: 'analytics', icon: BarChart3 },
  { href: '/dashboard/settings', labelKey: 'settings', icon: Settings },
] as const;
