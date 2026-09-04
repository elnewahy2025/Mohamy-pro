'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DeadlineListSection } from '@/components/pages/deadlines/deadline-list-section';
import { DeadlineSection } from '@/components/pages/deadlines/deadline-section';
import { DeadlineRuleSection } from '@/components/pages/deadlines/deadline-rule-section';
import { Button } from '@/components/ui/button';

export function DeadlinesPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'schedule' | 'rules'>('list');

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
          onClick={() => setActiveTab('list')}
        >
          {t('deadlines.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'schedule' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('schedule')}
        >
          {t('deadlines.sections.schedule')}
        </Button>
        <Button 
          variant={activeTab === 'rules' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('rules')}
        >
          {t('deadlines.sections.rules')}
        </Button>
      </div>

      <div className="tab-content">
        {activeTab === 'list' && <DeadlineListSection />}
        {activeTab === 'schedule' && <DeadlineSection />}
        {activeTab === 'rules' && <DeadlineRuleSection />}
      </div>
    </section>
  );
}
