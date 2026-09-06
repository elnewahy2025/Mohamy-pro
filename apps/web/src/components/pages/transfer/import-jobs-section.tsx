'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { TransferClient, type ImportJobResult, type ImportRowErrorResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const jobsSchema = z.object({
  jobId: z.string().optional().or(z.literal('')),
});
type JobsForm = z.infer<typeof jobsSchema>;

export function ImportJobsSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new TransferClient());
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [jobs, setJobs] = useState<ImportJobResult[]>([]);
  const [errors, setErrors] = useState<ImportRowErrorResult[]>([]);

  const { register, handleSubmit, getValues } = useRHForm<JobsForm>({
    resolver: zodResolver(jobsSchema),
    defaultValues: { jobId: '' },
  });

  async function runLoad(): Promise<void> {
    try {
      setStatus('submitting');
      setErrors([]);
      setJobs(await client.listImports());
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  async function runErrors(): Promise<void> {
    const jobId = getValues().jobId;
    if (!jobId) return;
    try {
      setStatus('submitting');
      setErrors(await client.listImportErrors(jobId));
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
      <h3>{t('transfer.sections.jobs.heading')}</h3>
      <p>{t('transfer.sections.jobs.description')}</p>

      <form onSubmit={handleSubmit(runLoad)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('transfer.labels.jobId')}
            inputProps={{
              type: 'text',
              placeholder: t('transfer.placeholders.jobId'),
              ...register('jobId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('transfer.submitting') : t('transfer.load')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => runErrors()}>
            {status === 'submitting' ? t('transfer.submitting') : t('transfer.validate')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('transfer.result.title')}
            errorTitle={t('transfer.result.errorTitle')}
            fields={[{ label: t('transfer.result.id'), value: String(jobs.length) }]}
          />
        )}

        {status === 'success' && jobs.length > 0 && (
          <ul className="mt-4 space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="text-sm">
                {job.entityType} — {job.status} · {job.validRows}/{job.totalRows}
              </li>
            ))}
          </ul>
        )}

        {status === 'success' && errors.length > 0 && (
          <ul className="mt-4 space-y-2">
            {errors.map((entry) => (
              <li key={entry.id} className="text-sm">
                row {entry.rowNumber}: {(entry.errors as string[]).join('; ')}
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
