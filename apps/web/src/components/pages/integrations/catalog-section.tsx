'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IntegrationsClient, type ApiError } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { OperationResult } from '@/components/forms/operation-result';

export function CatalogSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new IntegrationsClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [events, setEvents] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setEvents(await client.events());
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
      <h3>{t('integrations.sections.catalog.heading')}</h3>
      <p>{t('integrations.sections.catalog.description')}</p>

      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runLoad()}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('integrations.submitting')
            : t('integrations.load')}
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
            {
              label: t('integrations.result.id'),
              value: String(events.length),
            },
          ]}
        />
      )}

      {events.length > 0 && (
        <ul className="mt-4 space-y-2">
          {events.map((event) => (
            <li key={event} className="text-sm">
              {event}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
