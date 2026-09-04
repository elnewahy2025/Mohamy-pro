'use client';

import { useTranslations } from 'next-intl';
import { PartySection } from '@/components/pages/parties/party-section';
import { PartyListSection } from '@/components/pages/parties/party-list-section';
import { PartyRelationshipSection } from '@/components/pages/parties/party-relationship-section';

export function PartiesPage(): React.ReactNode {
  const t = useTranslations();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('parties.eyebrow')}</p>
        <h1>{t('parties.title')}</h1>
        <p>{t('parties.description')}</p>
      </div>
      <div className="settings-stack">
        <PartyListSection />
        <PartySection />
        <PartyRelationshipSection />
      </div>
    </section>
  );
}
