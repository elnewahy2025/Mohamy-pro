import {
  Activity,
  ArrowRightLeft,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  Gavel,
  LayoutDashboard,
  Scale,
  Settings2,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface AppNavItem {
  href: string;
  labelKey: `navigation.${string}`;
  icon: LucideIcon;
}

export interface AppNavGroup {
  id: string;
  titleKey: `navigation.groups.${string}`;
  icon: LucideIcon;
  items: AppNavItem[];
}

export const appNavGroups: AppNavGroup[] = [
  {
    id: 'workspace',
    titleKey: 'navigation.groups.workspace',
    icon: LayoutDashboard,
    items: [
      { href: '/', labelKey: 'navigation.overview', icon: LayoutDashboard },
      { href: '/operations', labelKey: 'navigation.operations', icon: Activity },
      { href: '/tasks', labelKey: 'navigation.tasks', icon: CheckSquare },
    ],
  },
  {
    id: 'clients-parties',
    titleKey: 'navigation.groups.clientsParties',
    icon: Users,
    items: [
      { href: '/clients', labelKey: 'navigation.clients', icon: Users },
      { href: '/parties', labelKey: 'navigation.parties', icon: Users },
      { href: '/conflict-checks', labelKey: 'navigation.conflictChecks', icon: ShieldAlert },
    ],
  },
  {
    id: 'matters',
    titleKey: 'navigation.groups.matters',
    icon: Briefcase,
    items: [
      { href: '/cases', labelKey: 'navigation.cases', icon: Briefcase },
      { href: '/hearings', labelKey: 'navigation.hearings', icon: Gavel },
      { href: '/deadlines', labelKey: 'navigation.deadlines', icon: Calendar },
    ],
  },
  {
    id: 'configuration',
    titleKey: 'navigation.groups.configuration',
    icon: Settings2,
    items: [
      { href: '/organization', labelKey: 'navigation.organization', icon: Building2 },
      { href: '/legal-config', labelKey: 'navigation.legalConfig', icon: Scale },
      { href: '/workflows', labelKey: 'navigation.workflows', icon: Activity },
      { href: '/integrations', labelKey: 'navigation.integrations', icon: ArrowRightLeft },
      { href: '/settings', labelKey: 'navigation.settings', icon: Settings2 },
    ],
  },
];
