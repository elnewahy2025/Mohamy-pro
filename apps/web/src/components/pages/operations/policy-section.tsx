'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OpsClient, type ApiError } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function PolicySection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new OpsClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [rpoHours, setRpoHours] = useState('24');
  const [rtoHours, setRtoHours] = useState('4');
  const [scheduleCron, setScheduleCron] = useState('0 2 * * *');
  const [retentionDays, setRetentionDays] = useState('90');

  async function runSave(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      await client.setPolicy(
        Number(rpoHours),
        Number(rtoHours),
        scheduleCron,
        Number(retentionDays),
      );
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
      <h3>{t('operations.sections.policy.heading')}</h3>
      <p>{t('operations.sections.policy.description')}</p>

      <FormField
        label={t('operations.labels.rpoHours')}
        inputProps={{
          value: rpoHours,
          onChange: (e) => setRpoHours(e.target.value),
          placeholder: t('operations.placeholders.rpoHours'),
          required: true,
        }}
      />
      <FormField
        label={t('operations.labels.rtoHours')}
        inputProps={{
          value: rtoHours,
          onChange: (e) => setRtoHours(e.target.value),
          placeholder: t('operations.placeholders.rtoHours'),
          required: true,
        }}
      />
      <FormField
        label={t('operations.labels.scheduleCron')}
        inputProps={{
          value: scheduleCron,
          onChange: (e) => setScheduleCron(e.target.value),
          placeholder: t('operations.placeholders.scheduleCron'),
          required: true,
        }}
      />
      <FormField
        label={t('operations.labels.retentionDays')}
        inputProps={{
          value: retentionDays,
          onChange: (e) => setRetentionDays(e.target.value),
          placeholder: t('operations.placeholders.retentionDays'),
          required: true,
        }}
      />
      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runSave()}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('operations.submitting')
            : t('operations.save')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('operations.result.title')}
          errorTitle={t('operations.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
        />
      )}
    </div>
  );
}
