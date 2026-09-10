'use client';

import { useState } from 'react';
import type { ConflictCheckListRow } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { ConflictCheckSection } from '@/components/pages/conflict-checks/conflict-check-section';
import { ConflictCheckListSection } from '@/components/pages/conflict-checks/conflict-check-list-section';
import { Button } from '@/components/ui/button';

export function ConflictChecksPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [selected, setSelected] = useState<ConflictCheckListRow | null>(null);

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    list: true,
  });

  const handleTabChange = (tab: 'list' | 'create') => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('conflictChecks.eyebrow')}</p>
        <h1>{t('conflictChecks.title')}</h1>
        <p>{t('conflictChecks.description')}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button
          variant={activeTab === 'list' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('list')}
        >
          {t('conflictChecks.sections.list')}
        </Button>
        <Button
          variant={activeTab === 'create' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('create')}
        >
          {t('conflictChecks.sections.check')}
        </Button>
      </div>

      <div className="settings-stack">
        <div className={activeTab === 'list' ? 'block' : 'hidden'}>
          {mountedTabs.list && (
            <ConflictCheckListSection onSelect={setSelected} />
          )}
        </div>
        <div className={activeTab === 'create' ? 'block' : 'hidden'}>
          {mountedTabs.create && <ConflictCheckSection selected={selected} />}
        </div>
      </div>
    </section>
  );
}
