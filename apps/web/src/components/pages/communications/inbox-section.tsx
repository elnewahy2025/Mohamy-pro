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
import { OperationResult } from '@/components/forms/operation-result';

const inboxSchema = z.object({
  threadId: z.string().optional().or(z.literal('')),
  caseId: z.string().optional().or(z.literal('')),
  clientId: z.string().optional().or(z.literal('')),
  channel: z.string().optional().or(z.literal('')),
});
type InboxForm = z.infer<typeof inboxSchema>;

export function InboxSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [messages, setMessages] = useState<MessageResult[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<InboxForm>({
    resolver: zodResolver(inboxSchema),
    defaultValues: { threadId: '', caseId: '', clientId: '', channel: '' },
  });

  async function runLoad(form: InboxForm): Promise<void> {
    try {
      const client = new CommsClient();
      setStatus('submitting');
      setMessages([]);
      const result = await client.listMessages({
        threadId: form.threadId || undefined,
        caseId: form.caseId || undefined,
        clientId: form.clientId || undefined,
        channel: form.channel || undefined,
      });
      setMessages(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('communications.sections.inbox.heading')}</h3>
      <p>{t('communications.sections.inbox.description')}</p>

      <form onSubmit={handleSubmit(runLoad)} className="space-y-6 mt-6">
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
            label={t('communications.labels.channel')}
            error={errors.channel ? t(`form.errors.${errors.channel.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.channel'),
              ...register('channel'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('communications.submitting') : t('communications.load')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('communications.result.title')}
            errorTitle={t('communications.result.errorTitle')}
            fields={[{ label: t('communications.result.id'), value: String(messages.length) }]}
          />
        )}

        {status === 'success' && messages.length > 0 && (
          <ul className="mt-4 space-y-2">
            {messages.map((message) => (
              <li key={message.id} className="text-sm">
                [{message.channel}/{message.direction}] {message.status} — {message.body.slice(0, 80)}
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
