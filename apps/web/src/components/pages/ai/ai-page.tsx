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
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'request' && <RequestSection />}
        {activeTab === 'review' && <ReviewSection />}
      </div>
    </section>
  );
}
