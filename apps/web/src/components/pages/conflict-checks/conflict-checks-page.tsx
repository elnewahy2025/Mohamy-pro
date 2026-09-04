'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConflictCheckSection } from '@/components/pages/conflict-checks/conflict-check-section';
import { ConflictCheckListSection } from '@/components/pages/conflict-checks/conflict-check-list-section';
import { Button } from '@/components/ui/button';

export function ConflictChecksPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

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
          onClick={() => setActiveTab('list')}
        >
          {t('conflictChecks.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'create' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('create')}
        >
          {t('conflictChecks.sections.check')}
        </Button>
      </div>

      <div className="settings-stack">
        {activeTab === 'list' && <ConflictCheckListSection />}
        {activeTab === 'create' && <ConflictCheckSection />}
      </div>
    </section>
  );
}
