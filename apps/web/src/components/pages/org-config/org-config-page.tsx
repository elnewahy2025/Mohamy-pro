'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OrganizationSection } from '@/components/pages/org-config/organization-section';
import { BranchSection } from '@/components/pages/org-config/branch-section';
import { DepartmentSection } from '@/components/pages/org-config/department-section';
import { TeamSection } from '@/components/pages/org-config/team-section';
import { SettingsSection } from '@/components/pages/org-config/settings-section';
import { Button } from '@/components/ui/button';

export function OrgConfigPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'organization' | 'branch' | 'department' | 'team' | 'settings'>('organization');

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
          onClick={() => setActiveTab('organization')}
        >
          {t('orgConfig.sections.organization')}
        </Button>
        <Button 
          variant={activeTab === 'branch' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('branch')}
        >
          {t('orgConfig.sections.branch')}
        </Button>
        <Button 
          variant={activeTab === 'department' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('department')}
        >
          {t('orgConfig.sections.department')}
        </Button>
        <Button 
          variant={activeTab === 'team' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('team')}
        >
          {t('orgConfig.sections.team')}
        </Button>
        <Button 
          variant={activeTab === 'settings' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('settings')}
        >
          {t('orgConfig.sections.settings')}
        </Button>
      </div>

      <div className="settings-stack">
        {activeTab === 'organization' && <OrganizationSection />}
        {activeTab === 'branch' && <BranchSection />}
        {activeTab === 'department' && <DepartmentSection />}
        {activeTab === 'team' && <TeamSection />}
        {activeTab === 'settings' && <SettingsSection />}
      </div>
    </section>
  );
}
