'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { CommsClient, type MessageThreadResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const threadSchema = z.object({
  subject: z.string().optional().or(z.literal('')),
  caseId: z.string().optional().or(z.literal('')),
  clientId: z.string().optional().or(z.literal('')),
});
type ThreadForm = z.infer<typeof threadSchema>;

export function ThreadsSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<MessageThreadResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<ThreadForm>({
    resolver: zodResolver(threadSchema),
    defaultValues: { subject: '', caseId: '', clientId: '' },
  });

  async function runCreate(form: ThreadForm): Promise<void> {
    try {
      const client = new CommsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createThread({
        subject: form.subject || undefined,
        caseId: form.caseId || undefined,
        clientId: form.clientId || undefined,
      });
      setCreated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('communications.sections.threads.heading')}</h3>
      <p>{t('communications.sections.threads.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('communications.labels.subject')}
            error={errors.subject ? t(`form.errors.${errors.subject.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.subject'),
              ...register('subject'),
            }}
          />
          <FormField
            label={t('communications.labels.caseId')}
            error={errors.caseId ? t(`form.errors.${errors.caseId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.caseId'),
              ...register('caseId'),
            }}
          />
          <FormField
            label={t('communications.labels.clientId')}
            error={errors.clientId ? t(`form.errors.${errors.clientId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.clientId'),
              ...register('clientId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('communications.submitting') : t('communications.create')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('communications.result.title')}
            errorTitle={t('communications.result.errorTitle')}
            fields={created ? [
              { label: t('communications.result.id'), value: created.id },
              { label: t('communications.result.status'), value: created.status },
            ] : undefined}
          />
        )}
      </form>
    </div>
  );
}
