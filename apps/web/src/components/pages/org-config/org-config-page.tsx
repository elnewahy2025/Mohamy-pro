'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OrganizationSection } from '@/components/pages/org-config/organization-section';
import { BranchSection } from '@/components/pages/org-config/branch-section';
import { DepartmentSection } from '@/components/pages/org-config/department-section';
import { TeamSection } from '@/components/pages/org-config/team-section';
import { SettingsSection } from '@/components/pages/org-config/settings-section';
import { EmployeesDirectorySection } from '@/components/pages/org-config/employees-directory-section';
import { Button } from '@/components/ui/button';

export function OrgConfigPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<
    'organization' | 'branch' | 'department' | 'team' | 'settings' | 'directory'
  >('organization');

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    organization: true,
  });

  const handleTabChange = (
    tab: 'organization' | 'branch' | 'department' | 'team' | 'settings' | 'directory',
  ) => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('orgConfig.eyebrow')}</p>
        <h1>{t('orgConfig.title')}</h1>
        <p>{t('orgConfig.description')}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button
          variant={activeTab === 'organization' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('organization')}
        >
          {t('orgConfig.sections.organization')}
        </Button>
        <Button
          variant={activeTab === 'branch' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('branch')}
        >
          {t('orgConfig.sections.branch')}
        </Button>
        <Button
          variant={activeTab === 'department' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('department')}
        >
          {t('orgConfig.sections.department')}
        </Button>
        <Button
          variant={activeTab === 'team' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('team')}
        >
          {t('orgConfig.sections.team')}
        </Button>
        <Button
          variant={activeTab === 'settings' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('settings')}
        >
          {t('orgConfig.sections.settings')}
        </Button>
        <Button
          variant={activeTab === 'directory' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('directory')}
        >
          {t('orgConfig.sections.directory')}
        </Button>
      </div>

      <div className="settings-stack">
        <div className={activeTab === 'organization' ? 'block' : 'hidden'}>
          {mountedTabs.organization && <OrganizationSection />}
        </div>
        <div className={activeTab === 'branch' ? 'block' : 'hidden'}>
          {mountedTabs.branch && <BranchSection />}
        </div>
        <div className={activeTab === 'department' ? 'block' : 'hidden'}>
          {mountedTabs.department && <DepartmentSection />}
        </div>
        <div className={activeTab === 'team' ? 'block' : 'hidden'}>
          {mountedTabs.team && <TeamSection />}
        </div>
        <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
          {mountedTabs.settings && <SettingsSection />}
        </div>
        <div className={activeTab === 'directory' ? 'block' : 'hidden'}>
          {mountedTabs.directory && <EmployeesDirectorySection />}
        </div>
      </div>
    </section>
  );
}
