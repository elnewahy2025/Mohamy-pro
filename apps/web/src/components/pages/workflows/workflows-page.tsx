'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { WorkflowSection } from '@/components/pages/workflows/workflow-section';
import { WorkflowListSection } from '@/components/pages/workflows/workflow-list-section';
import { WorkflowVersionSection } from '@/components/pages/workflows/workflow-version-section';
import { Button } from '@/components/ui/button';

export function WorkflowsPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'workflow' | 'version'>('list');

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    list: true,
  });

  const handleTabChange = (tab: 'list' | 'workflow' | 'version') => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('workflows.eyebrow')}</p>
        <h1>{t('workflows.title')}</h1>
        <p>{t('workflows.description')}</p>
      </div>
      
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button 
          variant={activeTab === 'list' ? 'default' : 'ghost'} 
          onClick={() => handleTabChange('list')}
        >
          {t('workflows.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'workflow' ? 'default' : 'ghost'} 
          onClick={() => handleTabChange('workflow')}
        >
          {t('workflows.sections.workflow')}
        </Button>
        <Button 
          variant={activeTab === 'version' ? 'default' : 'ghost'} 
          onClick={() => handleTabChange('version')}
        >
          {t('workflows.sections.version')}
        </Button>
      </div>

      <div className="settings-stack">
        <div className={activeTab === 'list' ? 'block' : 'hidden'}>
          {mountedTabs.list && <WorkflowListSection />}
        </div>
        <div className={activeTab === 'workflow' ? 'block' : 'hidden'}>
          {mountedTabs.workflow && <WorkflowSection />}
        </div>
        <div className={activeTab === 'version' ? 'block' : 'hidden'}>
          {mountedTabs.version && <WorkflowVersionSection />}
        </div>
      </div>
    </section>
  );
}
