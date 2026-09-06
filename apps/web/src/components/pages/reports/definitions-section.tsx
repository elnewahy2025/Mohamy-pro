'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ReportsClient,
  type ReportDefinitionResult,
  type ApiError,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function DefinitionsSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new ReportsClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [items, setItems] = useState<ReportDefinitionResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [name, setName] = useState('');
  const [dataSource, setDataSource] = useState('');
  const [columns, setColumns] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setItems(await client.listDefinitions());
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
      const created = await client.createDefinition({
        name,
        dataSource: dataSource as 'CASE',
        columns: columns
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0),
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
      <h3>{t('reports.sections.definitions.heading')}</h3>
      <p>{t('reports.sections.definitions.description')}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runCreate();
        }}
      >
        <FormField
          label={t('reports.labels.name')}
          inputProps={{
            value: name,
            onChange: (e) => setName(e.target.value),
            placeholder: t('reports.placeholders.name'),
            required: true,
          }}
        />
        <FormField
          label={t('reports.labels.dataSource')}
          inputProps={{
            value: dataSource,
            onChange: (e) => setDataSource(e.target.value),
            placeholder: t('reports.placeholders.dataSource'),
            required: true,
          }}
        />
        <FormField
          label={t('reports.labels.columns')}
          inputProps={{
            value: columns,
            onChange: (e) => setColumns(e.target.value),
            placeholder: t('reports.placeholders.columns'),
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
              ? t('reports.submitting')
              : t('reports.create')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void runLoad()}
            disabled={status === 'submitting'}
          >
            {t('reports.load')}
          </Button>
        </div>
      </form>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('reports.result.title')}
          errorTitle={t('reports.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[
            {
              label: t('reports.result.id'),
              value: createdId ?? String(items.length),
            },
          ]}
        />
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              {item.name} — {item.dataSource} [{item.columns.join(', ')}]
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
