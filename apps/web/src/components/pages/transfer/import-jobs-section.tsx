'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import {
  TransferClient,
  type ImportJobResult,
  type ImportRowErrorResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { OperationResult } from '@/components/forms/operation-result';

const jobsSchema = z.object({
  jobId: z.string().optional().or(z.literal('')),
});
type JobsForm = z.infer<typeof jobsSchema>;

export function ImportJobsSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new TransferClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [jobs, setJobs] = useState<ImportJobResult[]>([]);
  const [errors, setErrors] = useState<ImportRowErrorResult[]>([]);

  const { handleSubmit, getValues, setValue, watch } = useRHForm<JobsForm>({
    resolver: zodResolver(jobsSchema),
    defaultValues: { jobId: '' },
  });
  const selectedJobId = watch('jobId');
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

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
        {selectedJob ? (
          <p className="form-field-hint">
            {selectedJob.entityType} — {selectedJob.status} ·{' '}
            {selectedJob.validRows}/{selectedJob.totalRows}
          </p>
        ) : null}

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting'
              ? t('transfer.submitting')
              : t('transfer.load')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={status === 'submitting'}
            onClick={() => runErrors()}
          >
            {status === 'submitting'
              ? t('transfer.submitting')
              : t('transfer.validate')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('transfer.result.title')}
            errorTitle={t('transfer.result.errorTitle')}
            fields={[
              { label: t('transfer.result.id'), value: String(jobs.length) },
            ]}
          />
        )}

        {status === 'success' && jobs.length > 0 && (
          <ul className="mt-4 space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setValue('jobId', job.id)}
                >
                  {job.entityType} — {job.status} · {job.validRows}/
                  {job.totalRows}
                </Button>
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
