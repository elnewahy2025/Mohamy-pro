'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PartySection } from '@/components/pages/parties/party-section';
import { PartyListSection } from '@/components/pages/parties/party-list-section';
import { PartyRelationshipSection } from '@/components/pages/parties/party-relationship-section';
import { Button } from '@/components/ui/button';

export function PartiesPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'relationship'>('list');

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
          onClick={() => setActiveTab('list')}
        >
          {t('parties.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'create' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('create')}
        >
          {t('parties.sections.party')}
        </Button>
        <Button 
          variant={activeTab === 'relationship' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('relationship')}
        >
          {t('parties.sections.relationship')}
        </Button>
      </div>

      <div className="settings-stack">
        {activeTab === 'list' && <PartyListSection />}
        {activeTab === 'create' && <PartySection />}
        {activeTab === 'relationship' && <PartyRelationshipSection />}
      </div>
    </section>
  );
}
