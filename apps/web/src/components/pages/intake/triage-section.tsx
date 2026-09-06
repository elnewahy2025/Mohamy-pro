'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IntakeClient, type ApiError } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function TriageSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new IntakeClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [requestId, setRequestId] = useState('');
  const [reason, setReason] = useState('');
  const [resultId, setResultId] = useState<string | null>(null);

  async function runAction(
    action: 'review' | 'approve' | 'reject',
  ): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const updated =
        action === 'review'
          ? await client.reviewRequest(requestId)
          : action === 'approve'
            ? await client.approveRequest(requestId)
            : await client.rejectRequest(requestId, reason);
      setResultId(`${updated.status}:${updated.createdClientId ?? updated.id}`);
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  if (!user) {
    return (
      <div className="section-card">
        <p>{t('common.signInRequired')}</p>
      </div>
    );
  }

  return (
    <div className="section-card">
      <h3>{t('intake.sections.triage.heading')}</h3>
      <p>{t('intake.sections.triage.description')}</p>

      <FormField
        label={t('intake.labels.requestId')}
        inputProps={{
          value: requestId,
          onChange: (e) => setRequestId(e.target.value),
          placeholder: t('intake.placeholders.requestId'),
          required: true,
        }}
      />
      <FormField
        label={t('intake.labels.reason')}
        inputProps={{
          value: reason,
          onChange: (e) => setReason(e.target.value),
          placeholder: t('intake.placeholders.reason'),
        }}
      />
      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => void runAction('review')}
          disabled={status === 'submitting'}
        >
          {t('intake.review')}
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={() => void runAction('approve')}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('intake.submitting')
            : t('intake.approve')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runAction('reject')}
          disabled={status === 'submitting'}
        >
          {t('intake.reject')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('intake.result.title')}
          errorTitle={t('intake.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[{ label: t('intake.result.id'), value: resultId ?? '—' }]}
        />
      )}
    </div>
  );
}
