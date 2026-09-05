'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { CommsClient, type MessageResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const composeSchema = z.object({
  threadId: z.string().optional().or(z.literal('')),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PHONE', 'INTERNAL', 'PORTAL']),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  subject: z.string().optional().or(z.literal('')),
  body: z.string().min(1, 'invalid'),
  caseId: z.string().optional().or(z.literal('')),
  clientId: z.string().optional().or(z.literal('')),
  taskId: z.string().optional().or(z.literal('')),
});
type ComposeForm = z.infer<typeof composeSchema>;

export function ComposeSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<MessageResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
    defaultValues: { threadId: '', channel: 'EMAIL', direction: 'OUTBOUND', subject: '', body: '', caseId: '', clientId: '', taskId: '' },
  });

  async function runCreate(form: ComposeForm): Promise<void> {
    try {
      const client = new CommsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.composeMessage({
        threadId: form.threadId || undefined,
        channel: form.channel,
        direction: form.direction,
        subject: form.subject || undefined,
        body: form.body,
        caseId: form.caseId || undefined,
        clientId: form.clientId || undefined,
        taskId: form.taskId || undefined,
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
      <h3>{t('communications.sections.compose.heading')}</h3>
      <p>{t('communications.sections.compose.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('communications.labels.threadId')}
            error={errors.threadId ? t(`form.errors.${errors.threadId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.threadId'),
              ...register('threadId'),
            }}
          />
          <FormSelect
            label={t('communications.labels.channel')}
            error={errors.channel ? t(`form.errors.${errors.channel.message}`) : undefined}
            options={['EMAIL', 'SMS', 'WHATSAPP', 'PHONE', 'INTERNAL', 'PORTAL'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('channel'),
            }}
          />
          <FormSelect
            label={t('communications.labels.direction')}
            error={errors.direction ? t(`form.errors.${errors.direction.message}`) : undefined}
            options={['INBOUND', 'OUTBOUND'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('direction'),
            }}
          />
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
            label={t('communications.labels.body')}
            error={errors.body ? t(`form.errors.${errors.body.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.body'),
              ...register('body'),
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
          <FormField
            label={t('communications.labels.taskId')}
            error={errors.taskId ? t(`form.errors.${errors.taskId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.taskId'),
              ...register('taskId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('communications.submitting') : t('communications.compose')}
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
