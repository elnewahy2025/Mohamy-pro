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

const deliverySchema = z.object({
  messageId: z.string().min(1, 'invalid'),
  status: z.enum(['SENT', 'DELIVERED', 'FAILED', 'READ']),
  error: z.string().optional().or(z.literal('')),
});
type DeliveryForm = z.infer<typeof deliverySchema>;

export function DeliverySection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [updated, setUpdated] = useState<MessageResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<DeliveryForm>({
    resolver: zodResolver(deliverySchema),
    defaultValues: { messageId: '', status: 'SENT', error: '' },
  });

  async function runRecord(form: DeliveryForm): Promise<void> {
    try {
      const client = new CommsClient();
      setStatus('submitting');
      setUpdated(null);
      const result = await client.recordStatus(form.messageId, {
        status: form.status,
        error: form.error || undefined,
      });
      setUpdated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('communications.sections.delivery.heading')}</h3>
      <p>{t('communications.sections.delivery.description')}</p>

      <form onSubmit={handleSubmit(runRecord)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('communications.labels.messageId')}
            error={errors.messageId ? t(`form.errors.${errors.messageId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.messageId'),
              ...register('messageId'),
            }}
          />
          <FormSelect
            label={t('communications.labels.status')}
            error={errors.status ? t(`form.errors.${errors.status.message}`) : undefined}
            options={['SENT', 'DELIVERED', 'FAILED', 'READ'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('status'),
            }}
          />
          <FormField
            label={t('communications.labels.error')}
            error={errors.error ? t(`form.errors.${errors.error.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.error'),
              ...register('error'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('communications.submitting') : t('communications.record')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('communications.result.title')}
            errorTitle={t('communications.result.errorTitle')}
            fields={updated ? [
              { label: t('communications.result.id'), value: updated.id },
              { label: t('communications.result.status'), value: updated.status },
            ] : undefined}
          />
        )}
      </form>
    </div>
  );
}
