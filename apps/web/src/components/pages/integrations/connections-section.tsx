'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  IntegrationsClient,
  type ApiError,
  type IntegrationHealth,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function ConnectionsSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new IntegrationsClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [rows, setRows] = useState<IntegrationHealth[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [key, setKey] = useState('');

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setRows(await client.health());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runToggle(enable: boolean): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      await client.set(key, enable);
      setRows(await client.health());
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
      <h3>{t('integrations.sections.connections.heading')}</h3>
      <p>{t('integrations.sections.connections.description')}</p>

      <FormField
        label={t('integrations.labels.key')}
        inputProps={{
          value: key,
          onChange: (e) => setKey(e.target.value),
          placeholder: t('integrations.placeholders.key'),
        }}
      />
      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => void runLoad()}
          disabled={status === 'submitting'}
        >
          {t('integrations.load')}
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={() => void runToggle(true)}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('integrations.submitting')
            : t('integrations.enable')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runToggle(false)}
          disabled={status === 'submitting'}
        >
          {t('integrations.disable')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('integrations.result.title')}
          errorTitle={t('integrations.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[
            { label: t('integrations.result.id'), value: String(rows.length) },
          ]}
        />
      )}

      {rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="text-sm">
              [{row.status}] {row.key}
              {row.errorMessage ? ` — ${row.errorMessage}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
