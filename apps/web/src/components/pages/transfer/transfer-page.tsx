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

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    import: true,
  });

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

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
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="tab-content">
        <div className={activeTab === 'import' ? 'block' : 'hidden'}>
          {mountedTabs.import && <ImportSection />}
        </div>
        <div className={activeTab === 'jobs' ? 'block' : 'hidden'}>
          {mountedTabs.jobs && <ImportJobsSection />}
        </div>
        <div className={activeTab === 'export' ? 'block' : 'hidden'}>
          {mountedTabs.export && <ExportSection />}
        </div>
      </div>
    </section>
  );
}
