'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DeadlineListSection } from '@/components/pages/deadlines/deadline-list-section';
import { DeadlineSection } from '@/components/pages/deadlines/deadline-section';
import { DeadlineRuleSection } from '@/components/pages/deadlines/deadline-rule-section';
import { Button } from '@/components/ui/button';

export function DeadlinesPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'schedule' | 'rules'>(
    'list',
  );

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    list: true,
  });

  const handleTabChange = (tab: 'list' | 'schedule' | 'rules') => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('deadlines.eyebrow')}</p>
        <h1>{t('deadlines.title')}</h1>
        <p>{t('deadlines.description')}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button
          variant={activeTab === 'list' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('list')}
        >
          {t('deadlines.sections.list')}
        </Button>
        <Button
          variant={activeTab === 'schedule' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('schedule')}
        >
          {t('deadlines.sections.schedule')}
        </Button>
        <Button
          variant={activeTab === 'rules' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('rules')}
        >
          {t('deadlines.sections.rules')}
        </Button>
      </div>

      <div className="tab-content">
        <div className={activeTab === 'list' ? 'block' : 'hidden'}>
          {mountedTabs.list && <DeadlineListSection />}
        </div>
        <div className={activeTab === 'schedule' ? 'block' : 'hidden'}>
          {mountedTabs.schedule && <DeadlineSection />}
        </div>
        <div className={activeTab === 'rules' ? 'block' : 'hidden'}>
          {mountedTabs.rules && <DeadlineRuleSection />}
        </div>
      </div>
    </section>
  );
}
