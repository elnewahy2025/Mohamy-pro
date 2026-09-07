'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OpsClient, type ApiError, type RestoreDrillResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function DrillsSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new OpsClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [items, setItems] = useState<RestoreDrillResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [name, setName] = useState('');
  const [targetRef, setTargetRef] = useState('');
  const [drillId, setDrillId] = useState('');
  const [checkName, setCheckName] = useState('');
  const [evidence, setEvidence] = useState('');
  const [resultId, setResultId] = useState<string | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setItems(await client.listDrills());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runStart(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const created = await client.startDrill(name, targetRef);
      setResultId(created.id);
      setItems((prev) => [created, ...prev]);
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runFinish(passed: boolean): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const updated = await client.finishDrill(drillId, passed, [
        {
          name: checkName || 'restore',
          passed,
          evidence: evidence || 'operator attested',
        },
      ]);
      setResultId(updated.id);
      setItems((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
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
      <h3>{t('operations.sections.drills.heading')}</h3>
      <p>{t('operations.sections.drills.description')}</p>

      <FormField
        label={t('operations.labels.name')}
        inputProps={{
          value: name,
          onChange: (e) => setName(e.target.value),
          placeholder: t('operations.placeholders.name'),
          required: true,
        }}
      />
      <FormField
        label={t('operations.labels.targetRef')}
        inputProps={{
          value: targetRef,
          onChange: (e) => setTargetRef(e.target.value),
          placeholder: t('operations.placeholders.targetRef'),
          required: true,
        }}
      />
      <FormField
        label={t('operations.labels.drillId')}
        inputProps={{
          value: drillId,
          onChange: (e) => setDrillId(e.target.value),
          placeholder: t('operations.placeholders.drillId'),
        }}
      />
      <FormField
        label={t('operations.labels.checkName')}
        inputProps={{
          value: checkName,
          onChange: (e) => setCheckName(e.target.value),
          placeholder: t('operations.placeholders.checkName'),
        }}
      />
      <FormField
        label={t('operations.labels.evidence')}
        inputProps={{
          value: evidence,
          onChange: (e) => setEvidence(e.target.value),
          placeholder: t('operations.placeholders.evidence'),
        }}
      />
      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runStart()}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('operations.submitting')
            : t('operations.start')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runFinish(true)}
          disabled={status === 'submitting'}
        >
          {t('operations.finishPassed')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runFinish(false)}
          disabled={status === 'submitting'}
        >
          {t('operations.finishFailed')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runLoad()}
          disabled={status === 'submitting'}
        >
          {t('operations.load')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('operations.result.title')}
          errorTitle={t('operations.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[
            {
              label: t('operations.result.id'),
              value: resultId ?? String(items.length),
            },
          ]}
        />
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              [{item.status}] {item.name} — {item.checks.length} checks
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
