'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ApiError,
  CasesClient,
  type CaseDetail,
  type CaseListRow,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function CaseDetailSection({
  selected,
}: {
  selected: CaseListRow | null;
}): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new CasesClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function run(id: string): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.get(id);
      setDetail(result);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(
              error instanceof Error ? error.message : 'Unknown error',
              'INTERNAL',
              [],
              0,
            ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (selected) void run(selected.id);
    else setDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <Eye size={18} />
        </span>
        <div>
          <h2>{t('cases.getDetail')}</h2>
          <p>{t('cases.entity.case.description')}</p>
        </div>
      </div>
      {submitting ? (
        <p className="form-field-hint">{t('common.loading')}</p>
      ) : detail ? (
        <div
          className="mt-4"
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div className="settings-card-heading">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
              {detail.caseNumber}
            </h3>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
            }}
          >
            <div>
              <span className="form-field-hint">
                {t('cases.labels.clientName')}
              </span>
              <p>{detail.client.displayName}</p>
            </div>
            <div>
              <span className="form-field-hint">
                {t('cases.labels.status')}
              </span>
              <p>{detail.status}</p>
            </div>
            <div>
              <span className="form-field-hint">
                {t('cases.labels.priority')}
              </span>
              <p>{detail.priority}</p>
            </div>
          </div>

          {detail.parties.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <h4
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  marginBottom: '0.5rem',
                }}
              >
                {t('cases.entity.party.title')}
              </h4>
              <div className="operation-result-details">
                {detail.parties.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      padding: '0.5rem 0',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <span>{entry.party.displayName}</span>
                    <span style={{ color: 'var(--muted)' }}>
                      {entry.role.label} · {entry.party.partyType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : submitError ? (
        <p className="form-field-error" style={{ marginTop: '1rem' }}>
          {submitError.message}
        </p>
      ) : null}
    </div>
  );
}
