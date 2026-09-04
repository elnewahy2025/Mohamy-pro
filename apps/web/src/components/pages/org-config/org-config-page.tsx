'use client';

import { useTranslations } from 'next-intl';
import { OrganizationSection } from '@/components/pages/org-config/organization-section';
import { BranchSection } from '@/components/pages/org-config/branch-section';
import { DepartmentSection } from '@/components/pages/org-config/department-section';
import { TeamSection } from '@/components/pages/org-config/team-section';
import { SettingsSection } from '@/components/pages/org-config/settings-section';

export function OrgConfigPage(): React.ReactNode {
  const t = useTranslations();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('orgConfig.eyebrow')}</p>
        <h1>{t('orgConfig.title')}</h1>
        <p>{t('orgConfig.description')}</p>
      </div>
      <div className="settings-stack">
        <OrganizationSection />
        <BranchSection />
        <DepartmentSection />
        <TeamSection />
        <SettingsSection />
      </div>
    </section>
  );
}
