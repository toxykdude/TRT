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
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/analysis', label: 'Analysis', icon: Activity },
  { href: '/dashboard/patients', label: 'Patients', icon: Users },
  { href: '/dashboard/labs', label: 'Labs', icon: FlaskConical },
  { href: '/dashboard/reports', label: 'Reports', icon: FileText },
  { href: '/dashboard/symptoms', label: 'Symptoms', icon: HeartPulse },
  { href: '/dashboard/timeline', label: 'Timeline', icon: Clock },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
] as const;
