'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuditSection } from '@/components/pages/compliance/audit-section';
import { RetentionSection } from '@/components/pages/compliance/retention-section';
import { HoldsSection } from '@/components/pages/compliance/holds-section';
import { Button } from '@/components/ui/button';

type Tab = 'audit' | 'retention' | 'holds';

export function CompliancePage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('audit');

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    audit: true,
  });

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'audit', label: t('compliance.sections.audit.heading') },
    { key: 'retention', label: t('compliance.sections.retention.heading') },
    { key: 'holds', label: t('compliance.sections.holds.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('compliance.eyebrow')}</p>
        <h1>{t('compliance.title')}</h1>
        <p>{t('compliance.description')}</p>
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
        <div className={activeTab === 'audit' ? 'block' : 'hidden'}>
          {mountedTabs.audit && <AuditSection />}
        </div>
        <div className={activeTab === 'retention' ? 'block' : 'hidden'}>
          {mountedTabs.retention && <RetentionSection />}
        </div>
        <div className={activeTab === 'holds' ? 'block' : 'hidden'}>
          {mountedTabs.holds && <HoldsSection />}
        </div>
      </div>
    </section>
  );
}
