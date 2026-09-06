'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImportSection } from '@/components/pages/transfer/import-section';
import { ImportJobsSection } from '@/components/pages/transfer/import-jobs-section';
import { ExportSection } from '@/components/pages/transfer/export-section';
import { Button } from '@/components/ui/button';

type Tab = 'import' | 'jobs' | 'export';

export function TransferPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('import');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'import', label: t('transfer.sections.import.heading') },
    { key: 'jobs', label: t('transfer.sections.jobs.heading') },
    { key: 'export', label: t('transfer.sections.export.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('transfer.eyebrow')}</p>
        <h1>{t('transfer.title')}</h1>
        <p>{t('transfer.description')}</p>
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
        {activeTab === 'import' && <ImportSection />}
        {activeTab === 'jobs' && <ImportJobsSection />}
        {activeTab === 'export' && <ExportSection />}
      </div>
    </section>
  );
}
