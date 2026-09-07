'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OpsClient, type ApiError, type OpsStatus } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { OperationResult } from '@/components/forms/operation-result';

export function StatusSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new OpsClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [data, setData] = useState<OpsStatus | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setData(await client.status());
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
      <h3>{t('operations.sections.status.heading')}</h3>
      <p>{t('operations.sections.status.description')}</p>

      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runLoad()}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('operations.submitting')
            : t('operations.load')}
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

      {status === 'success' && data && (
        <ul className="mt-4 space-y-2">
          <li className="text-sm">
            {t('operations.status.health')}:{' '}
            {String((data.health as { status?: string }).status ?? '—')}
          </li>
          <li className="text-sm">
            {t('operations.status.outbox')}:{' '}
            {Object.entries(data.outbox.mine)
              .map(([k, v]) => `${k} ${v}`)
              .join(', ') || '—'}
          </li>
          <li className="text-sm">
            {t('operations.status.policy')}:{' '}
            {data.backupPolicy.configured
              ? t('operations.status.configured')
              : t('operations.status.missing')}
          </li>
          <li className="text-sm">
            {t('operations.status.drill')}:{' '}
            {data.latestDrill
              ? `${data.latestDrill.name} [${data.latestDrill.status}]`
              : '—'}
          </li>
        </ul>
      )}
    </div>
  );
}
