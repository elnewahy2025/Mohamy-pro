'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DocumentListSection } from '@/components/pages/documents/document-list-section';
import { DocumentCreateSection } from '@/components/pages/documents/document-create-section';
import { Button } from '@/components/ui/button';

export function DocumentsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

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
        <p className="eyebrow">{t('documents.eyebrow')}</p>
        <h1>{t('documents.title')}</h1>
        <p>{t('documents.description')}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button
          variant={activeTab === 'list' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('list')}
        >
          {t('documents.sections.list')}
        </Button>
        <Button
          variant={activeTab === 'create' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('create')}
        >
          {t('documents.sections.create')}
        </Button>
      </div>

      <div className="tab-content">
        <div className={activeTab === 'list' ? 'block' : 'hidden'}>
          {mountedTabs.list && <DocumentListSection />}
        </div>
        <div className={activeTab === 'create' ? 'block' : 'hidden'}>
          {mountedTabs.create && <DocumentCreateSection />}
        </div>
      </div>
    </section>
  );
}
