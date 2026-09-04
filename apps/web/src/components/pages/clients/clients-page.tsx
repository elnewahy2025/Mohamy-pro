'use client';

import { useTranslations } from 'next-intl';
import { ClientSection } from '@/components/pages/clients/client-section';
import { ClientListSection } from '@/components/pages/clients/client-list-section';
import { ContactSection } from '@/components/pages/clients/contact-section';
import { AddressSection } from '@/components/pages/clients/address-section';

export function ClientsPage(): React.ReactNode {
  const t = useTranslations();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('clients.eyebrow')}</p>
        <h1>{t('clients.title')}</h1>
        <p>{t('clients.description')}</p>
      </div>
      <div className="settings-stack">
        <ClientListSection />
        <ClientSection />
        <ContactSection />
        <AddressSection />
      </div>
    </section>
  );
}
