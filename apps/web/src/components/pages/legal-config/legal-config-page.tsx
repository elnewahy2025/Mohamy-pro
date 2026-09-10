'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CountrySection } from '@/components/pages/legal-config/country-section';
import { JurisdictionSection } from '@/components/pages/legal-config/jurisdiction-section';
import { CourtSection } from '@/components/pages/legal-config/court-section';
import { CourtLocationSection } from '@/components/pages/legal-config/court-location-section';
import { Button } from '@/components/ui/button';

export function LegalConfigPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<
    'country' | 'jurisdiction' | 'court' | 'location'
  >('country');

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    country: true,
  });

  const handleTabChange = (tab: 'country' | 'jurisdiction' | 'court' | 'location') => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('legalConfig.eyebrow')}</p>
        <h1>{t('legalConfig.title')}</h1>
        <p>{t('legalConfig.description')}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button
          variant={activeTab === 'country' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('country')}
        >
          {t('legalConfig.sections.country.heading')}
        </Button>
        <Button
          variant={activeTab === 'jurisdiction' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('jurisdiction')}
        >
          {t('legalConfig.sections.jurisdiction.heading')}
        </Button>
        <Button
          variant={activeTab === 'court' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('court')}
        >
          {t('legalConfig.sections.court.heading')}
        </Button>
        <Button
          variant={activeTab === 'location' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('location')}
        >
          {t('legalConfig.sections.courtLocation.heading')}
        </Button>
      </div>

      <div className="settings-stack">
        <div className={activeTab === 'country' ? 'block' : 'hidden'}>
          {mountedTabs.country && <CountrySection />}
        </div>
        <div className={activeTab === 'jurisdiction' ? 'block' : 'hidden'}>
          {mountedTabs.jurisdiction && <JurisdictionSection />}
        </div>
        <div className={activeTab === 'court' ? 'block' : 'hidden'}>
          {mountedTabs.court && <CourtSection />}
        </div>
        <div className={activeTab === 'location' ? 'block' : 'hidden'}>
          {mountedTabs.location && <CourtLocationSection />}
        </div>
      </div>
    </section>
  );
}
