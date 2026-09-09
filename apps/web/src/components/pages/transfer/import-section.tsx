'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { TransferClient, type ImportJobResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const importSchema = z.object({
  entityType: z.enum(['CASE', 'CLIENT', 'PARTY', 'TASK']),
  content: z.string().optional().or(z.literal('')),
  storageObjectId: z.string().optional().or(z.literal('')),
  idempotencyKey: z.string().min(1, 'invalid'),
});
type ImportForm = z.infer<typeof importSchema>;

export function ImportSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new TransferClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [job, setJob] = useState<ImportJobResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<ImportForm>({
    resolver: zodResolver(importSchema),
    defaultValues: {
      entityType: 'CASE',
      content: '',
      storageObjectId: '',
      idempotencyKey: '',
    },
  });

  async function runCreate(form: ImportForm): Promise<void> {
    try {
      setStatus('submitting');
      setJob(null);
      const result = await client.createImport({
        entityType: form.entityType,
        content: form.content || undefined,
        storageObjectId: form.storageObjectId || undefined,
        idempotencyKey: form.idempotencyKey,
      });
      setJob(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  async function runStep(
    step: 'validate' | 'approve' | 'rollback',
  ): Promise<void> {
    if (!job) return;
    try {
      setStatus('submitting');
      const next =
        step === 'validate'
          ? await client.validateImport(job.id)
          : step === 'approve'
            ? await client.approveImport(job.id)
            : await client.rollbackImport(job.id);
      setJob(next);
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
      <h3>{t('transfer.sections.import.heading')}</h3>
      <p>{t('transfer.sections.import.description')}</p>

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
            label={t('transfer.labels.content')}
            error={
              errors.content
                ? t(`form.errors.${errors.content.message}`)
                : undefined
            }
            inputProps={{
              type: 'text',
              placeholder: t('transfer.placeholders.content'),
              ...register('content'),
            }}
          />
          <FormField
            label={t('transfer.labels.storageObjectId')}
            error={
              errors.storageObjectId
                ? t(`form.errors.${errors.storageObjectId.message}`)
                : undefined
            }
            inputProps={{
              type: 'text',
              placeholder: t('transfer.placeholders.storageObjectId'),
              ...register('storageObjectId'),
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
            disabled={status === 'submitting' || !job}
            onClick={() => runStep('validate')}
          >
            {status === 'submitting'
              ? t('transfer.submitting')
              : t('transfer.validate')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={status === 'submitting' || !job}
            onClick={() => runStep('approve')}
          >
            {status === 'submitting'
              ? t('transfer.submitting')
              : t('transfer.approve')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={status === 'submitting' || !job}
            onClick={() => runStep('rollback')}
          >
            {status === 'submitting'
              ? t('transfer.submitting')
              : t('transfer.rollback')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('transfer.result.title')}
            errorTitle={t('transfer.result.errorTitle')}
            fields={
              job
                ? [
                    { label: t('transfer.result.id'), value: job.id },
                    { label: t('transfer.result.status'), value: job.status },
                  ]
                : undefined
            }
          />
        )}
      </form>
    </div>
  );
}
