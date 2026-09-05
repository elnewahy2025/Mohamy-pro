'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { BillingsClient, type PaymentResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const paymentSchema = z.object({
  invoiceId: z.string().min(1, 'invalid'),
  amount: z.string().min(1, 'invalid'),
  providerRef: z.string().optional().or(z.literal('')),
  idempotencyKey: z.string().min(1, 'invalid'),
});
type PaymentForm = z.infer<typeof paymentSchema>;

export function PaymentSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<PaymentResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { invoiceId: '', amount: '', providerRef: '', idempotencyKey: '' },
  });

  async function runCreate(form: PaymentForm): Promise<void> {
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.recordPayment({
        invoiceId: form.invoiceId,
        amount: Number(form.amount),
        providerRef: form.providerRef || undefined,
        idempotencyKey: form.idempotencyKey,
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
      <h3>{t('billing.sections.payment.heading')}</h3>
      <p>{t('billing.sections.payment.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('billing.labels.invoiceId')}
            error={errors.invoiceId ? t(`form.errors.${errors.invoiceId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.invoiceId'),
              ...register('invoiceId'),
            }}
          />
          <FormField
            label={t('billing.labels.amount')}
            error={errors.amount ? t(`form.errors.${errors.amount.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.amount'),
              ...register('amount'),
            }}
          />
          <FormField
            label={t('billing.labels.providerRef')}
            error={errors.providerRef ? t(`form.errors.${errors.providerRef.message}`) : undefined}
            inputProps={{
              type: 'text',
              ...register('providerRef'),
            }}
          />
          <FormField
            label={t('billing.labels.idempotencyKey')}
            error={errors.idempotencyKey ? t(`form.errors.${errors.idempotencyKey.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.idempotencyKey'),
              ...register('idempotencyKey'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.recordPayment')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('billing.result.title')}
            errorTitle={t('billing.result.errorTitle')}
            fields={created ? [
              { label: t('billing.result.id'), value: created.id },
              { label: t('billing.result.status'), value: created.status },
            ] : undefined}
          />
        )}
      </form>
    </div>
  );
}
