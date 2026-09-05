'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CaseSection } from '@/components/pages/cases/case-section';
import { CaseListSection } from '@/components/pages/cases/case-list-section';
import { CasePartySection } from '@/components/pages/cases/case-party-section';
import { CaseDetailSection } from '@/components/pages/cases/case-detail-section';
import { CaseTimelineSection } from '@/components/pages/cases/case-timeline-section';
import { CaseAssignmentSection } from '@/components/pages/cases/case-assignment-section';
import { Button } from '@/components/ui/button';

export function CasesPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'parties' | 'details' | 'timeline' | 'assignments'>('list');

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('cases.eyebrow')}</p>
        <h1>{t('cases.title')}</h1>
        <p>{t('cases.description')}</p>
      </div>
      
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button 
          variant={activeTab === 'list' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('list')}
        >
          {t('cases.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'create' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('create')}
        >
          {t('cases.sections.case')}
        </Button>
        <Button 
          variant={activeTab === 'parties' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('parties')}
        >
          {t('cases.sections.party')}
        </Button>
        <Button 
          variant={activeTab === 'details' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('details')}
        >
          {t('cases.sections.details')}
        </Button>
        <Button 
          variant={activeTab === 'timeline' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('timeline')}
        >
          {t('casesTimeline.title')}
        </Button>
        <Button 
          variant={activeTab === 'assignments' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('assignments')}
        >
          {t('cases.sections.assignments')}
        </Button>
      </div>

      <div className="settings-stack">
        {activeTab === 'list' && <CaseListSection />}
        {activeTab === 'create' && <CaseSection />}
        {activeTab === 'parties' && <CasePartySection />}
        {activeTab === 'details' && <CaseDetailSection />}
        {activeTab === 'timeline' && <CaseTimelineSection />}
        {activeTab === 'assignments' && <CaseAssignmentSection />}
      </div>
    </section>
  );
}
