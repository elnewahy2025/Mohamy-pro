'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SubmitSection } from '@/components/pages/intake/submit-section';
import { TriageSection } from '@/components/pages/intake/triage-section';
import { Button } from '@/components/ui/button';

type Tab = 'submit' | 'triage';

export function IntakePage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('submit');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'submit', label: t('intake.sections.submit.heading') },
    { key: 'triage', label: t('intake.sections.triage.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('intake.eyebrow')}</p>
        <h1>{t('intake.title')}</h1>
        <p>{t('intake.description')}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'default' : 'ghost'}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'submit' && <SubmitSection />}
        {activeTab === 'triage' && <TriageSection />}
      </div>
    </section>
  );
}
