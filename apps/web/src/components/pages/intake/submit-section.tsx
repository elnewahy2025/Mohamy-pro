'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  IntakeClient,
  type ApiError,
  type IntakeRequestResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function SubmitSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new IntakeClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [items, setItems] = useState<IntakeRequestResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [fullName, setFullName] = useState('');
  const [clientType, setClientType] = useState('');
  const [matterSummary, setMatterSummary] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);

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

  async function runCreate(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const created = await client.createRequest({
        fullName,
        clientType,
        matterSummary,
      });
      setCreatedId(created.id);
      setItems((prev) => [created, ...prev]);
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
      <h3>{t('intake.sections.submit.heading')}</h3>
      <p>{t('intake.sections.submit.description')}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runCreate();
        }}
      >
        <FormField
          label={t('intake.labels.fullName')}
          inputProps={{
            value: fullName,
            onChange: (e) => setFullName(e.target.value),
            placeholder: t('intake.placeholders.fullName'),
            required: true,
          }}
        />
        <FormField
          label={t('intake.labels.clientType')}
          inputProps={{
            value: clientType,
            onChange: (e) => setClientType(e.target.value),
            placeholder: t('intake.placeholders.clientType'),
            required: true,
          }}
        />
        <FormField
          label={t('intake.labels.matterSummary')}
          inputProps={{
            value: matterSummary,
            onChange: (e) => setMatterSummary(e.target.value),
            placeholder: t('intake.placeholders.matterSummary'),
            required: true,
          }}
        />
        <div className="form-actions form-actions-row mt-6">
          <Button
            type="submit"
            variant="default"
            disabled={status === 'submitting'}
          >
            {status === 'submitting'
              ? t('intake.submitting')
              : t('intake.create')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void runLoad()}
            disabled={status === 'submitting'}
          >
            {t('intake.load')}
          </Button>
        </div>
      </form>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('intake.result.title')}
          errorTitle={t('intake.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[
            {
              label: t('intake.result.id'),
              value: createdId ?? String(items.length),
            },
          ]}
        />
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              [{item.status}] {item.fullName} —{' '}
              {item.matterSummary.slice(0, 80)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
