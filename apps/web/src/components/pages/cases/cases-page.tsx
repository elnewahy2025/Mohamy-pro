'use client';

import { useTranslations } from 'next-intl';
import { CaseSection } from '@/components/pages/cases/case-section';
import { CaseListSection } from '@/components/pages/cases/case-list-section';
import { CasePartySection } from '@/components/pages/cases/case-party-section';
import { CaseDetailSection } from '@/components/pages/cases/case-detail-section';

export function CasesPage(): React.ReactNode {
  const t = useTranslations();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('cases.eyebrow')}</p>
        <h1>{t('cases.title')}</h1>
        <p>{t('cases.description')}</p>
      </div>
      <div className="settings-stack">
        <CaseListSection />
        <CaseSection />
        <CasePartySection />
        <CaseDetailSection />
      </div>
    </section>
  );
}
