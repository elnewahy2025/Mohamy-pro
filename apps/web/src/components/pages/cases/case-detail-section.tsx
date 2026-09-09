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
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <Eye size={18} />
        </span>
        <div>
          <h2>{t('cases.getDetail')}</h2>
          <p>{t('cases.entity.case.description')}</p>
        </div>
      </div>
      {detail ? (
        <p className="form-field-hint">
          {detail.caseNumber} [{detail.status}]
        </p>
      ) : selected ? (
        <p className="form-field-hint">
          {selected.caseNumber} [{selected.status}]
        </p>
      ) : null}
      <div className="form-actions form-actions-row">
        <Button
          type="button"
          variant="default"
          onClick={() => selected && void run(selected.id)}
          disabled={submitting || authLoading || !user || !selected}
        >
          {submitting ? t('cases.submitting') : t('cases.getDetail')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('cases.result.title')}
        errorTitle={t('cases.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={
          detail
            ? [
                {
                  label: t('cases.result.caseNumber'),
                  value: detail.caseNumber,
                },
                { label: t('cases.result.status'), value: detail.status },
                { label: t('cases.result.priority'), value: detail.priority },
                {
                  label: t('cases.result.client'),
                  value: detail.client.displayName,
                },
              ]
            : undefined
        }
      />
      {detail && detail.parties.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {detail.parties.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <span>{entry.party.displayName}</span>
              <span>
                {entry.role.label} · {entry.party.partyType}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
