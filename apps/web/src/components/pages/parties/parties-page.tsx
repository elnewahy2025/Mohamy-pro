'use client';

import { useState } from 'react';
import type { PartyResult } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { PartySection } from '@/components/pages/parties/party-section';
import { PartyListSection } from '@/components/pages/parties/party-list-section';
import { PartyRelationshipSection } from '@/components/pages/parties/party-relationship-section';
import { Button } from '@/components/ui/button';

export function PartiesPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<
    'list' | 'create' | 'relationship'
  >('list');
  const [selected, setSelected] = useState<PartyResult | null>(null);

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    list: true,
  });

  const handleTabChange = (tab: 'list' | 'create' | 'relationship') => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('parties.eyebrow')}</p>
        <h1>{t('parties.title')}</h1>
        <p>{t('parties.description')}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button
          variant={activeTab === 'list' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('list')}
        >
          {t('parties.sections.list')}
        </Button>
        <Button
          variant={activeTab === 'create' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('create')}
        >
          {t('parties.sections.party')}
        </Button>
        <Button
          variant={activeTab === 'relationship' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('relationship')}
        >
          {t('parties.sections.relationship')}
        </Button>
      </div>

      <div className="settings-stack">
        <div className={activeTab === 'list' ? 'block' : 'hidden'}>
          {mountedTabs.list && <PartyListSection onSelect={setSelected} />}
        </div>
        <div className={activeTab === 'create' ? 'block' : 'hidden'}>
          {mountedTabs.create && <PartySection selected={selected} />}
        </div>
        <div className={activeTab === 'relationship' ? 'block' : 'hidden'}>
          {mountedTabs.relationship && (
            <PartyRelationshipSection selected={selected} />
          )}
        </div>
      </div>
    </section>
  );
}
