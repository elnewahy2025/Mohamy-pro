'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DocumentListSection } from '@/components/pages/documents/document-list-section';
import { DocumentCreateSection } from '@/components/pages/documents/document-create-section';
import { Button } from '@/components/ui/button';

export function DocumentsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

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
          onClick={() => setActiveTab('list')}
        >
          {t('documents.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'create' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('create')}
        >
          {t('documents.sections.create')}
        </Button>
      </div>

      <div className="tab-content">
        {activeTab === 'list' && <DocumentListSection />}
        {activeTab === 'create' && <DocumentCreateSection />}
      </div>
    </section>
  );
}
