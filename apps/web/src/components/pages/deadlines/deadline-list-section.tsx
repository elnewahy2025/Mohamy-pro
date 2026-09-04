'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/auth/auth-provider';
import { DeadlinesClient, CasesClient, type DeadlineResult, type CaseListRow } from '@/lib/api';
import { FormSelect } from '@/components/forms/form-select';

export function DeadlineListSection() {
  const t = useTranslations();
  const { user } = useAuth();
  
  const [deadlines, setDeadlines] = useState<DeadlineResult[]>([]);
  const [cases, setCases] = useState<CaseListRow[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  
  const client = new DeadlinesClient();
  const casesClient = new CasesClient();

  useEffect(() => {
    if (user) {
      casesClient.list().then(res => setCases(res.data)).catch(() => {});
    }
  }, [user, casesClient]);

  useEffect(() => {
    if (user) {
      client.listDeadlines(selectedCaseId || undefined).then(res => setDeadlines(res.data)).catch(() => {});
    }
  }, [user, selectedCaseId]);

  return (
    <div className="section-card">
      <h3>{t('deadlines.sections.list')}</h3>
      <p>{t('deadlines.description')}</p>

      <div className="form-grid mb-6 mt-4">
        <FormSelect
          label={t('deadlines.labels.caseId')}
          options={[{ label: 'All Cases', value: '' }, ...cases.map(c => ({ label: c.caseNumber, value: c.id }))]}
          selectProps={{
            value: selectedCaseId,
            onChange: (e) => setSelectedCaseId(e.target.value),
          }}
        />
      </div>

      <div className="space-y-4">
        {deadlines.length === 0 ? (
          <p className="text-sm text-gray-500">No deadlines found.</p>
        ) : (
          deadlines.map((d) => (
            <div key={d.id} className="p-4 border rounded-md">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-medium text-gray-900">{d.title}</h4>
                  <p className="text-sm text-gray-500">
                    {new Date(d.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    d.status === 'OVERDUE' ? 'bg-red-100 text-red-800' :
                    d.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    d.status === 'CANCELLED' ? 'bg-gray-100 text-gray-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {t(`common.enums.${d.status}`) || d.status}
                  </span>
                  <span className="text-xs text-gray-400 border px-1.5 py-0.5 rounded">
                    {t(`common.enums.${d.deadlineType}`) || d.deadlineType}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
