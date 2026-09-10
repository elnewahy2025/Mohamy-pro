'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { StatusSection } from '@/components/pages/operations/status-section';
import { PolicySection } from '@/components/pages/operations/policy-section';
import { DrillsSection } from '@/components/pages/operations/drills-section';
import { Button } from '@/components/ui/button';

type Tab = 'status' | 'policy' | 'drills';

export function OperationsConsolePage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('status');

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    status: true,
  });

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'status', label: t('operations.sections.status.heading') },
    { key: 'policy', label: t('operations.sections.policy.heading') },
    { key: 'drills', label: t('operations.sections.drills.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('operations.eyebrow')}</p>
        <h1>{t('operations.title')}</h1>
        <p>{t('operations.description')}</p>
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
        <div className={activeTab === 'status' ? 'block' : 'hidden'}>
          {mountedTabs.status && <StatusSection />}
        </div>
        <div className={activeTab === 'policy' ? 'block' : 'hidden'}>
          {mountedTabs.policy && <PolicySection />}
        </div>
        <div className={activeTab === 'drills' ? 'block' : 'hidden'}>
          {mountedTabs.drills && <DrillsSection />}
        </div>
      </div>
    </section>
  );
}
