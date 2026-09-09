'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/auth/auth-provider';
import { HearingsClient, CasesClient, type HearingResult } from '@/lib/api';
import { EntityPicker } from '@/components/forms/entity-picker';

interface Props {
  onSelect?: (id: string, label: string) => void;
}

export function HearingListSection({ onSelect }: Props) {
  const t = useTranslations();
  const { user } = useAuth();
  
  const [hearings, setHearings] = useState<HearingResult[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  
  const client = new HearingsClient();
  const casesClient = new CasesClient();

  useEffect(() => {
    if (user) {
      client.listHearings(selectedCaseId || undefined).then(setHearings).catch(() => {});
    }
  }, [user, selectedCaseId]);

  return (
    <div className="section-card">
      <h3>{t('hearings.sections.list')}</h3>
      <p>{t('hearings.description')}</p>

      <div className="form-grid mb-6">
        <EntityPicker
          label={t('hearings.labels.caseId')}
          placeholder={t('common.search')}
          value={selectedCaseId}
          onChange={(val) => setSelectedCaseId(val)}
          load={async (search) => {
            return (await casesClient.list(search ? { search } : {})).data.map((c) => ({
              id: c.id,
              label: c.caseNumber,
              sub: c.status,
            }));
          }}
        />
      </div>

      <div className="space-y-4">
        {hearings.length === 0 ? (
          <p className="text-sm text-gray-500">No hearings found.</p>
        ) : (
          hearings.map((h) => (
            <div 
              key={h.id} 
              className={`p-4 border rounded-md ${onSelect ? 'cursor-pointer hover:border-teal-500 hover:shadow-sm transition-all' : ''}`}
              onClick={() => {
                if (onSelect) {
                  const label = `${new Date(h.date).toLocaleDateString()} - ${h.hearingType || 'Hearing'}`;
                  onSelect(h.id, label);
                }
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-medium text-gray-900">{h.hearingType || 'Hearing'}</h4>
                  <p className="text-sm text-gray-500">
                    {new Date(h.date).toLocaleDateString()} {h.time && `at ${h.time}`}
                  </p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {t(`common.enums.${h.status}`) || h.status}
                </span>
              </div>
              {h.outcome && (
                <div className="mt-2 text-sm text-gray-700 bg-gray-50 p-2 rounded">
                  <strong>{t('hearings.labels.outcome')}:</strong> {h.outcome}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
