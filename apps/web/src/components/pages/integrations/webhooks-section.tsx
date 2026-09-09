'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  IntegrationsClient,
  type ApiError,
  type WebhookEndpointResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function WebhooksSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new IntegrationsClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [items, setItems] = useState<WebhookEndpointResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('');
  const [webhookId, setWebhookId] = useState('');
  const [webhookLabel, setWebhookLabel] = useState('');
  const [secret, setSecret] = useState<string | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setItems(await client.listWebhooks());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runRegister(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const result = await client.registerWebhook(
        url,
        events
          .split(',')
          .map((e) => e.trim())
          .filter((e) => e.length > 0),
      );
      setSecret(result.secret);
      setItems((prev) => [result.endpoint, ...prev]);
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runRotate(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const result = await client.rotateWebhook(webhookId);
      setSecret(result.secret);
      setItems((prev) =>
        prev.map((w) => (w.id === result.endpoint.id ? result.endpoint : w)),
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
      <h3>{t('integrations.sections.webhooks.heading')}</h3>
      <p>{t('integrations.sections.webhooks.description')}</p>

      <FormField
        label={t('integrations.labels.url')}
        inputProps={{
          value: url,
          onChange: (e) => setUrl(e.target.value),
          placeholder: t('integrations.placeholders.url'),
        }}
      />
      <FormField
        label={t('integrations.labels.events')}
        inputProps={{
          value: events,
          onChange: (e) => setEvents(e.target.value),
          placeholder: t('integrations.placeholders.events'),
        }}
      />
      {webhookId ? (
        <p className="form-field-hint">
          {t('integrations.labels.webhookId')}: {webhookLabel || '…'}
        </p>
      ) : null}
      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runRegister()}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('integrations.submitting')
            : t('integrations.register')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runRotate()}
          disabled={status === 'submitting'}
        >
          {t('integrations.rotate')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runLoad()}
          disabled={status === 'submitting'}
        >
          {t('integrations.load')}
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
            { label: t('integrations.result.id'), value: String(items.length) },
            ...(secret
              ? [{ label: t('integrations.labels.secret'), value: secret }]
              : []),
          ]}
        />
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setWebhookId(item.id);
                  setWebhookLabel(item.url);
                }}
              >
                [{item.status}] {item.url} — {item.events.join(', ')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
