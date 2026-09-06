'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DefinitionsSection } from '@/components/pages/reports/definitions-section';
import { RunSection } from '@/components/pages/reports/run-section';
import { SchedulesSection } from '@/components/pages/reports/schedules-section';
import { Button } from '@/components/ui/button';

type Tab = 'definitions' | 'run' | 'schedules';

export function ReportsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('definitions');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'definitions', label: t('reports.sections.definitions.heading') },
    { key: 'run', label: t('reports.sections.run.heading') },
    { key: 'schedules', label: t('reports.sections.schedules.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('reports.eyebrow')}</p>
        <h1>{t('reports.title')}</h1>
        <p>{t('reports.description')}</p>
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
        {activeTab === 'definitions' && <DefinitionsSection />}
        {activeTab === 'run' && <RunSection />}
        {activeTab === 'schedules' && <SchedulesSection />}
      </div>
    </section>
  );
}
