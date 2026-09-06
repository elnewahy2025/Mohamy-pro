'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ComplianceClient,
  type ApiError,
  type AuditEventResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function AuditSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new ComplianceClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [items, setItems] = useState<AuditEventResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [eventType, setEventType] = useState('');

  async function runSearch(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setItems(await client.searchAudit(eventType ? { eventType } : undefined));
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runExport(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const { csv } = await client.exportAudit(
        eventType ? { eventType } : undefined,
      );
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'audit-export.csv';
      anchor.click();
      URL.revokeObjectURL(url);
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
      <h3>{t('compliance.sections.audit.heading')}</h3>
      <p>{t('compliance.sections.audit.description')}</p>

      <FormField
        label={t('compliance.labels.eventType')}
        inputProps={{
          value: eventType,
          onChange: (e) => setEventType(e.target.value),
          placeholder: t('compliance.placeholders.eventType'),
        }}
      />
      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runSearch()}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('compliance.submitting')
            : t('compliance.search')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runExport()}
          disabled={status === 'submitting'}
        >
          {t('compliance.export')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('compliance.result.title')}
          errorTitle={t('compliance.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[
            { label: t('compliance.result.id'), value: String(items.length) },
          ]}
        />
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.slice(0, 20).map((item) => (
            <li key={item.id} className="text-sm">
              {item.occurredAt.slice(0, 10)} — {item.eventType} [{item.outcome}]
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
