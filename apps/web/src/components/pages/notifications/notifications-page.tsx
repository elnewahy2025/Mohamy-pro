'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { InboxSection } from '@/components/pages/notifications/inbox-section';
import { PreferencesSection } from '@/components/pages/notifications/preferences-section';
import { RulesSection } from '@/components/pages/notifications/rules-section';
import { Button } from '@/components/ui/button';

type Tab = 'inbox' | 'preferences' | 'rules';

export function NotificationsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('inbox');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'inbox', label: t('notifications.sections.inbox.heading') },
    { key: 'preferences', label: t('notifications.sections.preferences.heading') },
    { key: 'rules', label: t('notifications.sections.rules.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('notifications.eyebrow')}</p>
        <h1>{t('notifications.title')}</h1>
        <p>{t('notifications.description')}</p>
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
        {activeTab === 'inbox' && <InboxSection />}
        {activeTab === 'preferences' && <PreferencesSection />}
        {activeTab === 'rules' && <RulesSection />}
      </div>
    </section>
  );
}
