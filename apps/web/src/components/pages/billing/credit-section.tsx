'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { BillingsClient, type CreditResult, type RefundResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const creditSchema = z.object({
  clientId: z.string().min(1, 'invalid'),
  caseId: z.string().optional().or(z.literal('')),
  amount: z.string().min(1, 'invalid'),
  applyCreditId: z.string().optional().or(z.literal('')),
  applyInvoiceId: z.string().optional().or(z.literal('')),
  applyAmount: z.string().optional().or(z.literal('')),
  refundPaymentId: z.string().optional().or(z.literal('')),
  refundAmount: z.string().optional().or(z.literal('')),
  refundReason: z.string().optional().or(z.literal('')),
});
type CreditForm = z.infer<typeof creditSchema>;

export function CreditSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [credit, setCredit] = useState<CreditResult | null>(null);
  const [refund, setRefund] = useState<RefundResult | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useRHForm<CreditForm>({
    resolver: zodResolver(creditSchema),
    defaultValues: { clientId: '', caseId: '', amount: '', applyCreditId: '', applyInvoiceId: '', applyAmount: '', refundPaymentId: '', refundAmount: '', refundReason: '' },
  });

  async function runCreate(form: CreditForm): Promise<void> {
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setCredit(null);
      setRefund(null);
      const result = await client.createCredit({
        clientId: form.clientId,
        caseId: form.caseId || undefined,
        amount: Number(form.amount),
      });
      setCredit(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  async function runApply(): Promise<void> {
    const form = getValues();
    if (!form.applyCreditId || !form.applyInvoiceId || !form.applyAmount) return;
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setCredit(null);
      setRefund(null);
      const result = await client.applyCredit(form.applyCreditId, {
        invoiceId: form.applyInvoiceId,
        amount: Number(form.applyAmount),
      });
      setCredit(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  async function runRefund(): Promise<void> {
    const form = getValues();
    if (!form.refundPaymentId || !form.refundAmount) return;
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setCredit(null);
      setRefund(null);
      const result = await client.issueRefund({
        paymentId: form.refundPaymentId,
        amount: Number(form.refundAmount),
        reason: form.refundReason || undefined,
      });
      setRefund(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('billing.sections.credit.heading')}</h3>
      <p>{t('billing.sections.credit.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('billing.labels.clientId')}
            error={errors.clientId ? t(`form.errors.${errors.clientId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.clientId'),
              ...register('clientId'),
            }}
          />
          <FormField
            label={t('billing.labels.caseId')}
            error={errors.caseId ? t(`form.errors.${errors.caseId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.caseId'),
              ...register('caseId'),
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
            label={t('billing.labels.creditId')}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.creditId'),
              ...register('applyCreditId'),
            }}
          />
          <FormField
            label={t('billing.labels.invoiceId')}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.invoiceId'),
              ...register('applyInvoiceId'),
            }}
          />
          <FormField
            label={t('billing.labels.amount')}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.amount'),
              ...register('applyAmount'),
            }}
          />
          <FormField
            label={t('billing.labels.paymentId')}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.paymentId'),
              ...register('refundPaymentId'),
            }}
          />
          <FormField
            label={t('billing.labels.amount')}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.amount'),
              ...register('refundAmount'),
            }}
          />
          <FormField
            label={t('billing.labels.reason')}
            inputProps={{
              type: 'text',
              ...register('refundReason'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.create')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => runApply()}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.applyCredit')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => runRefund()}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.issueRefund')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('billing.result.title')}
            errorTitle={t('billing.result.errorTitle')}
            fields={credit ? [{ label: t('billing.result.id'), value: credit.id }]
              : refund ? [{ label: t('billing.result.id'), value: refund.id }]
              : undefined}
          />
        )}
      </form>
    </div>
  );
}
