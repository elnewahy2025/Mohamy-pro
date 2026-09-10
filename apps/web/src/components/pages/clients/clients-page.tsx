'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ClientResult } from '@/lib/api';
import { ClientSection } from '@/components/pages/clients/client-section';
import { ClientListSection } from '@/components/pages/clients/client-list-section';
import { ContactSection } from '@/components/pages/clients/contact-section';
import { AddressSection } from '@/components/pages/clients/address-section';
import { Button } from '@/components/ui/button';

export function ClientsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<
    'list' | 'create' | 'contact' | 'address'
  >('list');
  const [selected, setSelected] = useState<ClientResult | null>(null);

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    list: true,
  });

  const handleTabChange = (tab: 'list' | 'create' | 'contact' | 'address') => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('clients.eyebrow')}</p>
        <h1>{t('clients.title')}</h1>
        <p>{t('clients.description')}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button
          variant={activeTab === 'list' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('list')}
        >
          {t('clients.sections.list')}
        </Button>
        <Button
          variant={activeTab === 'create' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('create')}
        >
          {t('clients.sections.client')}
        </Button>
        <Button
          variant={activeTab === 'contact' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('contact')}
        >
          {t('clients.sections.contact')}
        </Button>
        <Button
          variant={activeTab === 'address' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('address')}
        >
          {t('clients.sections.address')}
        </Button>
      </div>

      <div className="settings-stack">
        <div className={activeTab === 'list' ? 'block' : 'hidden'}>
          {mountedTabs.list && <ClientListSection onSelect={setSelected} />}
        </div>
        <div className={activeTab === 'create' ? 'block' : 'hidden'}>
          {mountedTabs.create && <ClientSection selected={selected} />}
        </div>
        <div className={activeTab === 'contact' ? 'block' : 'hidden'}>
          {mountedTabs.contact && <ContactSection selected={selected} />}
        </div>
        <div className={activeTab === 'address' ? 'block' : 'hidden'}>
          {mountedTabs.address && <AddressSection selected={selected} />}
        </div>
      </div>
    </section>
  );
}
