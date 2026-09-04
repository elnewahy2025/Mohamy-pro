'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { HearingListSection } from '@/components/pages/hearings/hearing-list-section';
import { HearingSection } from '@/components/pages/hearings/hearing-section';
import { HearingOutcomeSection } from '@/components/pages/hearings/hearing-outcome-section';
import { Button } from '@/components/ui/button';

export function HearingsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'schedule' | 'outcome'>('list');

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('hearings.eyebrow')}</p>
        <h1>{t('hearings.title')}</h1>
        <p>{t('hearings.description')}</p>
      </div>
      
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button 
          variant={activeTab === 'list' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('list')}
        >
          {t('hearings.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'schedule' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('schedule')}
        >
          {t('hearings.sections.schedule')}
        </Button>
        <Button 
          variant={activeTab === 'outcome' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('outcome')}
        >
          {t('hearings.sections.outcome')}
        </Button>
      </div>

      <div className="tab-content">
        {activeTab === 'list' && <HearingListSection />}
        {activeTab === 'schedule' && <HearingSection />}
        {activeTab === 'outcome' && <HearingOutcomeSection />}
      </div>
    </section>
  );
}
