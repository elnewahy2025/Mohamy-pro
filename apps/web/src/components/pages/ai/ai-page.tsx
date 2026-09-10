'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RequestSection } from '@/components/pages/ai/request-section';
import { ReviewSection } from '@/components/pages/ai/review-section';
import { Button } from '@/components/ui/button';

type Tab = 'request' | 'review';

export function AiPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('request');

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    request: true,
  });

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'request', label: t('ai.sections.request.heading') },
    { key: 'review', label: t('ai.sections.review.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('ai.eyebrow')}</p>
        <h1>{t('ai.title')}</h1>
        <p>{t('ai.description')}</p>
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
        <div className={activeTab === 'request' ? 'block' : 'hidden'}>
          {mountedTabs.request && <RequestSection />}
        </div>
        <div className={activeTab === 'review' ? 'block' : 'hidden'}>
          {mountedTabs.review && <ReviewSection />}
        </div>
      </div>
    </section>
  );
}
