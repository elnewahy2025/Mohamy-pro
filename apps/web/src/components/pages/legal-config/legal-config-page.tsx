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
  const [activeTab, setActiveTab] = useState<'country' | 'jurisdiction' | 'court' | 'location'>('country');

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
          onClick={() => setActiveTab('country')}
        >
          {t('legalConfig.sections.country.heading')}
        </Button>
        <Button 
          variant={activeTab === 'jurisdiction' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('jurisdiction')}
        >
          {t('legalConfig.sections.jurisdiction.heading')}
        </Button>
        <Button 
          variant={activeTab === 'court' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('court')}
        >
          {t('legalConfig.sections.court.heading')}
        </Button>
        <Button 
          variant={activeTab === 'location' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('location')}
        >
          {t('legalConfig.sections.courtLocation.heading')}
        </Button>
      </div>

      <div className="settings-stack">
        {activeTab === 'country' && <CountrySection />}
        {activeTab === 'jurisdiction' && <JurisdictionSection />}
        {activeTab === 'court' && <CourtSection />}
        {activeTab === 'location' && <CourtLocationSection />}
      </div>
    </section>
  );
}
