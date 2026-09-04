'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ClientSection } from '@/components/pages/clients/client-section';
import { ClientListSection } from '@/components/pages/clients/client-list-section';
import { ContactSection } from '@/components/pages/clients/contact-section';
import { AddressSection } from '@/components/pages/clients/address-section';
import { Button } from '@/components/ui/button';

export function ClientsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'contact' | 'address'>('list');

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
          onClick={() => setActiveTab('list')}
        >
          {t('clients.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'create' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('create')}
        >
          {t('clients.sections.client')}
        </Button>
        <Button 
          variant={activeTab === 'contact' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('contact')}
        >
          {t('clients.sections.contact')}
        </Button>
        <Button 
          variant={activeTab === 'address' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('address')}
        >
          {t('clients.sections.address')}
        </Button>
      </div>

      <div className="settings-stack">
        {activeTab === 'list' && <ClientListSection />}
        {activeTab === 'create' && <ClientSection />}
        {activeTab === 'contact' && <ContactSection />}
        {activeTab === 'address' && <AddressSection />}
      </div>
    </section>
  );
}
