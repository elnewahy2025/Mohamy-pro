'use client';

import { useEffect, useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { TransferClient, type ExportJobResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const exportSchema = z.object({
  entityType: z.enum(['CASE', 'CLIENT', 'PARTY', 'TASK']),
  maxRows: z.string().optional().or(z.literal('')),
  idempotencyKey: z.string().min(1, 'invalid'),
  jobId: z.string().optional().or(z.literal('')),
});
type ExportForm = z.infer<typeof exportSchema>;

export function ExportSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new TransferClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [job, setJob] = useState<ExportJobResult | null>(null);
  const [jobs, setJobs] = useState<ExportJobResult[]>([]);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useRHForm<ExportForm>({
    resolver: zodResolver(exportSchema),
    defaultValues: {
      entityType: 'CASE',
      maxRows: '',
      idempotencyKey: '',
      jobId: '',
    },
  });

  useEffect(() => {
    if (user) {
      void client
        .listExports()
        .then(setJobs)
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function runCreate(form: ExportForm): Promise<void> {
    try {
      setStatus('submitting');
      setJob(null);
      const result = await client.createExport({
        entityType: form.entityType,
        maxRows: form.maxRows ? Number(form.maxRows) : undefined,
        idempotencyKey: form.idempotencyKey,
      });
      setJob(result);
      setJobs((prev) => [result, ...prev]);
      setValue('jobId', result.id);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  async function runStep(step: 'run' | 'download'): Promise<void> {
    const id = getValues().jobId || job?.id;
    if (!id) return;
    try {
      setStatus('submitting');
      if (step === 'run') {
        setJob(await client.runExport(id));
      } else {
        const downloaded = await client.downloadExport(id);
        const blob = new Blob([downloaded.csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `export-${id}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      setStatus('success');
    } catch (e) {
      setStatus('error');
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
      <h3>{t('transfer.sections.export.heading')}</h3>
      <p>{t('transfer.sections.export.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormSelect
            label={t('transfer.labels.entityType')}
            error={
              errors.entityType
                ? t(`form.errors.${errors.entityType.message}`)
                : undefined
            }
            options={['CASE', 'CLIENT', 'PARTY', 'TASK'].map((v) => ({
              label: v,
              value: v,
            }))}
            selectProps={{
              ...register('entityType'),
            }}
          />
          <FormField
            label={t('transfer.labels.maxRows')}
            error={
              errors.maxRows
                ? t(`form.errors.${errors.maxRows.message}`)
                : undefined
            }
            inputProps={{
              type: 'text',
              placeholder: t('transfer.placeholders.maxRows'),
              ...register('maxRows'),
            }}
          />
          <FormField
            label={t('transfer.labels.idempotencyKey')}
            error={
              errors.idempotencyKey
                ? t(`form.errors.${errors.idempotencyKey.message}`)
                : undefined
            }
            inputProps={{
              type: 'text',
              placeholder: t('transfer.placeholders.idempotencyKey'),
              ...register('idempotencyKey'),
            }}
          />
          <JobSelector
            jobs={jobs}
            selectedId={watch('jobId') ?? ''}
            onSelect={(id) => setValue('jobId', id)}
            created={job}
            onCreatedSelect={(id) => setValue('jobId', id)}
            label={t('transfer.labels.jobId')}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting'
              ? t('transfer.submitting')
              : t('transfer.create')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={status === 'submitting'}
            onClick={() => runStep('run')}
          >
            {status === 'submitting'
              ? t('transfer.submitting')
              : t('transfer.run')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={status === 'submitting'}
            onClick={() => runStep('download')}
          >
            {status === 'submitting'
              ? t('transfer.submitting')
              : t('transfer.download')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('transfer.result.title')}
            errorTitle={t('transfer.result.errorTitle')}
            fields={
              job
                ? [{ label: t('transfer.result.status'), value: job.status }]
                : undefined
            }
          />
        )}
      </form>
    </div>
  );
}

function JobSelector({
  jobs,
  selectedId,
  onSelect,
  created,
  onCreatedSelect,
  label,
}: {
  jobs: ExportJobResult[];
  selectedId: string;
  onSelect: (id: string) => void;
  created: ExportJobResult | null;
  onCreatedSelect: (id: string) => void;
  label: string;
}) {
  const selected =
    jobs.find((j) => j.id === selectedId) ??
    (created?.id === selectedId ? created : null);
  return (
    <div>
      {selected ? (
        <p className="form-field-hint">
          {label}: {selected.entityType} — {selected.status} ·{' '}
          {selected.rowCount}/{selected.maxRows}
        </p>
      ) : null}
      {jobs.length > 0 && (
        <ul className="mt-4 space-y-2">
          {jobs.map((item) => (
            <li key={item.id} className="text-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSelect(item.id)}
              >
                {item.entityType} — {item.status} · {item.rowCount}/
                {item.maxRows}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {created && !jobs.some((j) => j.id === created.id) ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => onCreatedSelect(created.id)}
        >
          {created.entityType} — {created.status}
        </Button>
      ) : null}
    </div>
  );
}
