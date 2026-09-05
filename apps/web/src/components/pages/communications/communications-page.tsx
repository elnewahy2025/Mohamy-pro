'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ThreadsSection } from '@/components/pages/communications/threads-section';
import { ComposeSection } from '@/components/pages/communications/compose-section';
import { InboxSection } from '@/components/pages/communications/inbox-section';
import { DeliverySection } from '@/components/pages/communications/delivery-section';
import { AttachmentsSection } from '@/components/pages/communications/attachments-section';
import { ConsentSection } from '@/components/pages/communications/consent-section';
import { Button } from '@/components/ui/button';

type Tab = 'threads' | 'compose' | 'inbox' | 'delivery' | 'attachments' | 'consent';

export function CommunicationsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('inbox');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'threads', label: t('communications.sections.threads.heading') },
    { key: 'compose', label: t('communications.sections.compose.heading') },
    { key: 'inbox', label: t('communications.sections.inbox.heading') },
    { key: 'delivery', label: t('communications.sections.delivery.heading') },
    { key: 'attachments', label: t('communications.sections.attachments.heading') },
    { key: 'consent', label: t('communications.sections.consent.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('communications.eyebrow')}</p>
        <h1>{t('communications.title')}</h1>
        <p>{t('communications.description')}</p>
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
        {activeTab === 'threads' && <ThreadsSection />}
        {activeTab === 'compose' && <ComposeSection />}
        {activeTab === 'inbox' && <InboxSection />}
        {activeTab === 'delivery' && <DeliverySection />}
        {activeTab === 'attachments' && <AttachmentsSection />}
        {activeTab === 'consent' && <ConsentSection />}
      </div>
    </section>
  );
}
