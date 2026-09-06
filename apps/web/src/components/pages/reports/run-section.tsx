'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ReportsClient, type ReportOutput, type ApiError } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

export function RunSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new ReportsClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [definitionId, setDefinitionId] = useState('');
  const [output, setOutput] = useState<ReportOutput | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  async function runRun(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setOutput(await client.runDefinition(definitionId));
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
      <h3>{t('reports.sections.run.heading')}</h3>
      <p>{t('reports.sections.run.description')}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runRun();
        }}
      >
        <FormField
          label={t('reports.labels.definitionId')}
          inputProps={{
            value: definitionId,
            onChange: (e) => setDefinitionId(e.target.value),
            placeholder: t('reports.placeholders.definitionId'),
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
              : t('reports.run')}
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
              value: String(output?.total ?? 0),
            },
          ]}
        />
      )}

      {status === 'success' && output && output.rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                {output.columns.map((col) => (
                  <th key={col} className="px-2 text-start">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {output.rows.slice(0, 20).map((row, i) => (
                <tr key={i}>
                  {output.columns.map((col) => (
                    <td key={col} className="px-2">
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
