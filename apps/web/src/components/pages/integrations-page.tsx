'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionsSection } from '@/components/pages/integrations/connections-section';
import { WebhooksSection } from '@/components/pages/integrations/webhooks-section';
import { CatalogSection } from '@/components/pages/integrations/catalog-section';
import { Button } from '@/components/ui/button';

type Tab = 'connections' | 'webhooks' | 'catalog';

export function IntegrationsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('connections');

  const tabs: { key: Tab; label: string }[] = [
    {
      key: 'connections',
      label: t('integrations.sections.connections.heading'),
    },
    { key: 'webhooks', label: t('integrations.sections.webhooks.heading') },
    { key: 'catalog', label: t('integrations.sections.catalog.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('integrations.eyebrow')}</p>
        <h1>{t('integrations.title')}</h1>
        <p>{t('integrations.description')}</p>
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
        {activeTab === 'connections' && <ConnectionsSection />}
        {activeTab === 'webhooks' && <WebhooksSection />}
        {activeTab === 'catalog' && <CatalogSection />}
      </div>
    </section>
  );
}
