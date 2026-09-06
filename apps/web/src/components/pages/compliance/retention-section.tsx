'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ComplianceClient,
  type ApiError,
  type RetentionEvaluation,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function RetentionSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new ComplianceClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [rows, setRows] = useState<RetentionEvaluation[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [targetType, setTargetType] = useState('AUDIT_EVENT');
  const [retainYears, setRetainYears] = useState('7');

  async function runSave(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      await client.setPolicy(targetType, Number(retainYears));
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runEvaluate(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setRows(await client.evaluate());
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
      <h3>{t('compliance.sections.retention.heading')}</h3>
      <p>{t('compliance.sections.retention.description')}</p>

      <FormField
        label={t('compliance.labels.targetType')}
        inputProps={{
          value: targetType,
          onChange: (e) => setTargetType(e.target.value),
          placeholder: t('compliance.placeholders.targetType'),
          required: true,
        }}
      />
      <FormField
        label={t('compliance.labels.retainYears')}
        inputProps={{
          value: retainYears,
          onChange: (e) => setRetainYears(e.target.value),
          placeholder: t('compliance.placeholders.retainYears'),
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
            ? t('compliance.submitting')
            : t('compliance.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runEvaluate()}
          disabled={status === 'submitting'}
        >
          {t('compliance.evaluate')}
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
            { label: t('compliance.result.id'), value: String(rows.length) },
          ]}
        />
      )}

      {rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.targetType} className="text-sm">
              {row.targetType}: {row.retainYears}y — eligible {row.eligible},
              held {row.held}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
