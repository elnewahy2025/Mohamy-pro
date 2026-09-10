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
  const [selectedHearingId, setSelectedHearingId] = useState<string>('');
  const [selectedHearingLabel, setSelectedHearingLabel] = useState<string>('');

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    list: true,
  });

  const handleTabChange = (tab: 'list' | 'schedule' | 'outcome') => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  function handleSelectHearing(id: string, label: string) {
    setSelectedHearingId(id);
    setSelectedHearingLabel(label);
    handleTabChange('outcome'); // Usually selecting a hearing means you want to view/edit it (e.g. record outcome)
  }

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('hearings.eyebrow')}</p>
        <div className="flex items-center gap-3">
          <h1>{t('hearings.title')}</h1>
          {selectedHearingLabel && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-teal-100 text-teal-800 border border-teal-200">
              {selectedHearingLabel}
            </span>
          )}
        </div>
        <p>{t('hearings.description')}</p>
      </div>
      
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button 
          variant={activeTab === 'list' ? 'default' : 'ghost'} 
          onClick={() => handleTabChange('list')}
        >
          {t('hearings.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'schedule' ? 'default' : 'ghost'} 
          onClick={() => {
            setSelectedHearingId('');
            setSelectedHearingLabel('');
            handleTabChange('schedule');
          }}
        >
          {t('hearings.sections.schedule')}
        </Button>
        <Button 
          variant={activeTab === 'outcome' ? 'default' : 'ghost'} 
          onClick={() => handleTabChange('outcome')}
        >
          {t('hearings.sections.outcome')}
        </Button>
      </div>

      <div className="tab-content">
        <div className={activeTab === 'list' ? 'block' : 'hidden'}>
          {mountedTabs.list && <HearingListSection onSelect={handleSelectHearing} />}
        </div>
        <div className={activeTab === 'schedule' ? 'block' : 'hidden'}>
          {mountedTabs.schedule && <HearingSection />}
        </div>
        <div className={activeTab === 'outcome' ? 'block' : 'hidden'}>
          {mountedTabs.outcome && <HearingOutcomeSection hearingId={selectedHearingId} />}
        </div>
      </div>
    </section>
  );
}
