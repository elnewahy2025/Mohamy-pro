'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AiClient, type ApiError, type AiRequestResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function ReviewSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new AiClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [items, setItems] = useState<AiRequestResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [requestId, setRequestId] = useState('');
  const [reason, setReason] = useState('');
  const [resultId, setResultId] = useState<string | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setItems(await client.listRequests());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runApprove(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const updated = await client.approveRequest(requestId);
      setResultId(updated.id);
      setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runReject(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const updated = await client.rejectRequest(requestId, reason);
      setResultId(updated.id);
      setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
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
      <h3>{t('ai.sections.review.heading')}</h3>
      <p>{t('ai.sections.review.description')}</p>

      <FormField
        label={t('ai.labels.requestId')}
        inputProps={{
          value: requestId,
          onChange: (e) => setRequestId(e.target.value),
          placeholder: t('ai.placeholders.requestId'),
          required: true,
        }}
      />
      <FormField
        label={t('ai.labels.reason')}
        inputProps={{
          value: reason,
          onChange: (e) => setReason(e.target.value),
          placeholder: t('ai.placeholders.reason'),
        }}
      />
      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => void runLoad()}
          disabled={status === 'submitting'}
        >
          {t('ai.load')}
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={() => void runApprove()}
          disabled={status === 'submitting'}
        >
          {status === 'submitting' ? t('ai.submitting') : t('ai.approve')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runReject()}
          disabled={status === 'submitting'}
        >
          {t('ai.reject')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('ai.result.title')}
          errorTitle={t('ai.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[
            {
              label: t('ai.result.id'),
              value: resultId ?? String(items.length),
            },
          ]}
        />
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              [{item.status}] {item.taskType} —{' '}
              {item.outputText
                ? item.outputText.slice(0, 80)
                : t('ai.result.emptyOutput')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
