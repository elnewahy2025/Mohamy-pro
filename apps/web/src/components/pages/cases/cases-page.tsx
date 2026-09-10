'use client';

import { useState } from 'react';
import type { CaseListRow } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { CaseSection } from '@/components/pages/cases/case-section';
import { CaseListSection } from '@/components/pages/cases/case-list-section';
import { CasePartySection } from '@/components/pages/cases/case-party-section';
import { CaseDetailSection } from '@/components/pages/cases/case-detail-section';
import { CaseTimelineSection } from '@/components/pages/cases/case-timeline-section';
import { CaseAssignmentSection } from '@/components/pages/cases/case-assignment-section';
import { CaseBreakGlassSection } from '@/components/pages/cases/case-breakglass-section';
import { Button } from '@/components/ui/button';

export function CasesPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<
    'list' | 'create' | 'parties' | 'breakglass'
  >('list');
  const [selected, setSelected] = useState<CaseListRow | null>(null);

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    list: true,
  });

  const handleTabChange = (
    tab: 'list' | 'create' | 'parties' | 'breakglass',
  ) => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

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
          onClick={() => handleTabChange('list')}
        >
          {t('cases.sections.list')}
        </Button>
        <Button
          variant={activeTab === 'create' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('create')}
        >
          {t('cases.sections.case')}
        </Button>
        <Button
          variant={activeTab === 'parties' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('parties')}
        >
          {t('cases.sections.party')}
        </Button>
        <Button
          variant={activeTab === 'breakglass' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('breakglass')}
        >
          {t('cases.sections.breakglass')}
        </Button>
      </div>

      {selected && activeTab !== 'list' && (
        <div className="mb-4 p-3 bg-slate-50 border rounded text-sm text-slate-700 font-medium">
          {selected.caseNumber} — {selected.client.displayName} [
          {selected.status}]
        </div>
      )}

      <div className="settings-stack">
        <div className={activeTab === 'list' ? 'block' : 'hidden'}>
          {mountedTabs.list && (
            <div className="flex flex-col gap-6">
              <CaseListSection onSelect={setSelected} />
              {selected && (
                <div className="flex flex-col gap-6 mt-4">
                  <CaseDetailSection selected={selected} />
                  <CaseAssignmentSection selected={selected} />
                  <CaseTimelineSection selected={selected} />
                </div>
              )}
            </div>
          )}
        </div>
        <div className={activeTab === 'create' ? 'block' : 'hidden'}>
          {mountedTabs.create && <CaseSection selected={selected} />}
        </div>
        <div className={activeTab === 'parties' ? 'block' : 'hidden'}>
          {mountedTabs.parties && <CasePartySection selected={selected} />}
        </div>
        <div className={activeTab === 'breakglass' ? 'block' : 'hidden'}>
          {mountedTabs.breakglass && <CaseBreakGlassSection selected={selected} />}
        </div>
      </div>
    </section>
  );
}
