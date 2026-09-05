'use client';

import { useTranslations } from 'next-intl';
import { RoleListSection } from '@/components/pages/identity/role-list-section';
import { RoleCreateSection } from '@/components/pages/identity/role-create-section';
import { RoleAssignmentSection } from '@/components/pages/identity/role-assignment-section';

export function RolesPage(): React.ReactNode {
  const t = useTranslations();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('identity.eyebrow')}</p>
        <h1>{t('identity.roles.title')}</h1>
        <p>{t('identity.roles.description')}</p>
      </div>
      <div className="settings-stack">
        <RoleListSection />
        <RoleCreateSection />
        <RoleAssignmentSection />
      </div>
    </section>
  );
}
