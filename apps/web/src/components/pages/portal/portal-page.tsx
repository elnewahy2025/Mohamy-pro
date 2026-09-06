'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PortalCasesSection } from '@/components/pages/portal/portal-cases-section';
import { PortalDocumentsSection } from '@/components/pages/portal/portal-documents-section';
import { PortalAgendaSection } from '@/components/pages/portal/portal-agenda-section';
import { PortalMessagesSection } from '@/components/pages/portal/portal-messages-section';
import { PortalInvoicesSection } from '@/components/pages/portal/portal-invoices-section';
import { Button } from '@/components/ui/button';

type Tab = 'cases' | 'documents' | 'agenda' | 'messages' | 'invoices';

export function PortalPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('cases');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'cases', label: t('portal.sections.cases.heading') },
    { key: 'documents', label: t('portal.sections.documents.heading') },
    { key: 'agenda', label: t('portal.sections.agenda.heading') },
    { key: 'messages', label: t('portal.sections.messages.heading') },
    { key: 'invoices', label: t('portal.sections.invoices.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('portal.eyebrow')}</p>
        <h1>{t('portal.title')}</h1>
        <p>{t('portal.description')}</p>
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
        {activeTab === 'cases' && <PortalCasesSection />}
        {activeTab === 'documents' && <PortalDocumentsSection />}
        {activeTab === 'agenda' && <PortalAgendaSection />}
        {activeTab === 'messages' && <PortalMessagesSection />}
        {activeTab === 'invoices' && <PortalInvoicesSection />}
      </div>
    </section>
  );
}
