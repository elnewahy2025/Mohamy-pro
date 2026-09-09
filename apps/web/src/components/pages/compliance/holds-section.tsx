'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CasesClient,
  ClientsClient,
  ComplianceClient,
  DocumentsClient,
  type ApiError,
  type LegalHoldResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';
import { EntityPicker } from '@/components/forms/entity-picker';
import { FormSelect } from '@/components/forms/form-select';

export function HoldsSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new ComplianceClient());
  const [casesClient] = useState(() => new CasesClient());
  const [clientsClient] = useState(() => new ClientsClient());
  const [documentsClient] = useState(() => new DocumentsClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [items, setItems] = useState<LegalHoldResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [holdId, setHoldId] = useState('');
  const [holdLabel, setHoldLabel] = useState('');
  const [resultId, setResultId] = useState<string | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setItems(await client.listHolds());
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
      const created = await client.createHold(
        name,
        reason,
        targetType || undefined,
        targetId || undefined,
      );
      setResultId(created.id);
      setItems((prev) => [created, ...prev]);
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runRelease(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const released = await client.releaseHold(holdId, reason);
      setResultId(released.id);
      setItems((prev) =>
        prev.map((h) => (h.id === released.id ? released : h)),
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
      <h3>{t('compliance.sections.holds.heading')}</h3>
      <p>{t('compliance.sections.holds.description')}</p>

      <FormField
        label={t('compliance.labels.name')}
        inputProps={{
          value: name,
          onChange: (e) => setName(e.target.value),
          placeholder: t('compliance.placeholders.name'),
          required: true,
        }}
      />
      <FormField
        label={t('compliance.labels.reason')}
        inputProps={{
          value: reason,
          onChange: (e) => setReason(e.target.value),
          placeholder: t('compliance.placeholders.reason'),
          required: true,
        }}
      />
      <FormSelect
        label={t('compliance.labels.targetType')}
        options={[
          { label: '—', value: '' },
          { label: 'AUDIT_EVENT', value: 'AUDIT_EVENT' },
          { label: 'CASE', value: 'CASE' },
          { label: 'CLIENT', value: 'CLIENT' },
          { label: 'DOCUMENT', value: 'DOCUMENT' },
        ]}
        selectProps={{
          value: targetType,
          onChange: (e) => {
            setTargetType(e.target.value);
            setTargetId('');
          },
        }}
      />
      {targetType === '' || targetType === 'AUDIT_EVENT' ? null : (
        <EntityPicker
          label={t('compliance.labels.targetId')}
          placeholder={t('compliance.placeholders.targetId')}
          value={targetId}
          onChange={setTargetId}
          load={async (search) => {
            if (targetType === 'CASE') {
              return (
                await casesClient.list(search ? { search } : {})
              ).data.map((c) => ({
                id: c.id,
                label: c.caseNumber,
                sub: c.status,
              }));
            }
            if (targetType === 'CLIENT') {
              return (
                await clientsClient.listClients(search ? { search } : {})
              ).data.map((c) => ({
                id: c.id,
                label: c.displayName,
                sub: c.clientType,
              }));
            }
            return (await documentsClient.listDocuments()).map((d) => ({
              id: d.id,
              label: d.title,
              sub: d.status,
            }));
          }}
        />
      )}
      {holdId ? (
        <p className="form-field-hint">
          {t('compliance.labels.holdId')}: {holdLabel || '…'}
        </p>
      ) : null}
      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runCreate()}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('compliance.submitting')
            : t('compliance.create')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runRelease()}
          disabled={status === 'submitting'}
        >
          {t('compliance.release')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runLoad()}
          disabled={status === 'submitting'}
        >
          {t('compliance.load')}
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
            {
              label: t('compliance.result.id'),
              value: String(items.length),
            },
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
                  setHoldId(item.id);
                  setHoldLabel(item.name);
                }}
              >
                [{item.status}] {item.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
