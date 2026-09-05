'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionsSection } from '@/components/pages/calendar/connections-section';
import { SyncSection } from '@/components/pages/calendar/sync-section';
import { MappingsSection } from '@/components/pages/calendar/mappings-section';
import { ConflictsSection } from '@/components/pages/calendar/conflicts-section';
import { AgendaSection } from '@/components/pages/calendar/agenda-section';
import { Button } from '@/components/ui/button';

type Tab = 'connections' | 'sync' | 'mappings' | 'conflicts' | 'agenda';

export function CalendarPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('agenda');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'connections', label: t('calendar.sections.connections.heading') },
    { key: 'sync', label: t('calendar.sections.sync.heading') },
    { key: 'mappings', label: t('calendar.sections.mappings.heading') },
    { key: 'conflicts', label: t('calendar.sections.conflicts.heading') },
    { key: 'agenda', label: t('calendar.sections.agenda.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('calendar.eyebrow')}</p>
        <h1>{t('calendar.title')}</h1>
        <p>{t('calendar.description')}</p>
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
        {activeTab === 'sync' && <SyncSection />}
        {activeTab === 'mappings' && <MappingsSection />}
        {activeTab === 'conflicts' && <ConflictsSection />}
        {activeTab === 'agenda' && <AgendaSection />}
      </div>
    </section>
  );
}
