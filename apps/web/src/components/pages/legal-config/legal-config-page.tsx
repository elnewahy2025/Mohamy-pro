'use client';

import { useTranslations } from 'next-intl';
import { CountrySection } from '@/components/pages/legal-config/country-section';
import { JurisdictionSection } from '@/components/pages/legal-config/jurisdiction-section';
import { CourtSection } from '@/components/pages/legal-config/court-section';
import { CourtLocationSection } from '@/components/pages/legal-config/court-location-section';

export function LegalConfigPage(): React.ReactNode {
  const t = useTranslations();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('legalConfig.eyebrow')}</p>
        <h1>{t('legalConfig.title')}</h1>
        <p>{t('legalConfig.description')}</p>
      </div>
      <div className="settings-stack">
        <CountrySection />
        <JurisdictionSection />
        <CourtSection />
        <CourtLocationSection />
      </div>
    </section>
  );
}
