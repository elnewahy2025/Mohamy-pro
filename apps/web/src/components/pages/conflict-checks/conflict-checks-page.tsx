'use client';

import { useTranslations } from 'next-intl';
import { ConflictCheckSection } from '@/components/pages/conflict-checks/conflict-check-section';
import { ConflictCheckListSection } from '@/components/pages/conflict-checks/conflict-check-list-section';

export function ConflictChecksPage(): React.ReactNode {
  const t = useTranslations();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('conflictChecks.eyebrow')}</p>
        <h1>{t('conflictChecks.title')}</h1>
        <p>{t('conflictChecks.description')}</p>
      </div>
      <div className="settings-stack">
        <ConflictCheckListSection />
        <ConflictCheckSection />
      </div>
    </section>
  );
}
