'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { appNavGroups } from '@/components/navigation/nav-groups';

function isItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps): React.ReactNode {
  const t = useTranslations();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleGroup(id: string): void {
    setCollapsed((current) => ({ ...current, [id]: !current[id] }));
  }

  function isGroupCollapsed(groupId: string): boolean {
    if (collapsed[groupId] !== undefined) return collapsed[groupId];
    const group = appNavGroups.find((g) => g.id === groupId);
    return !(group?.items.some((item) => isItemActive(pathname, item.href)) ?? false);
  }

  return (
    <nav className="sidebar" aria-label={t('common.primaryNavigation')}>
      <ul className="sidebar-groups">
        {appNavGroups.map((group) => {
          const groupCollapsed = isGroupCollapsed(group.id);
          const GroupIcon = group.icon;
          return (
            <li className="sidebar-group" key={group.id}>
              <button
                type="button"
                className="sidebar-group-toggle"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!groupCollapsed}
              >
                <span className="sidebar-group-icon" aria-hidden="true">
                  <GroupIcon size={16} />
                </span>
                <span className="sidebar-group-title">{t(group.titleKey)}</span>
                <ChevronDown
                  className={`sidebar-chevron${groupCollapsed ? ' is-collapsed' : ''}`}
                  size={14}
                  aria-hidden="true"
                />
              </button>
              {!groupCollapsed ? (
                <ul className="sidebar-items">
                  {group.items.map((item) => {
                    const active = isItemActive(pathname, item.href);
                    const ItemIcon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`sidebar-link${active ? ' is-active' : ''}`}
                          aria-current={active ? 'page' : undefined}
                          onClick={onNavigate}
                        >
                          <ItemIcon className="sidebar-link-icon" size={15} aria-hidden="true" />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
