'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { BillingsClient, type InvoiceDetail } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const invoiceSchema = z.object({
  caseId: z.string().optional().or(z.literal('')),
  clientId: z.string().optional().or(z.literal('')),
  invoiceNumber: z.string().min(1, 'invalid'),
  discountAmount: z.string().optional().or(z.literal('')),
  taxRuleId: z.string().optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  timeEntryIds: z.string().optional().or(z.literal('')),
  feeIds: z.string().optional().or(z.literal('')),
  expenseIds: z.string().optional().or(z.literal('')),
});
type InvoiceForm = z.infer<typeof invoiceSchema>;

function splitIds(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export function InvoiceSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<InvoiceDetail | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<InvoiceForm>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: { caseId: '', clientId: '', invoiceNumber: '', discountAmount: '', taxRuleId: '', dueDate: '', timeEntryIds: '', feeIds: '', expenseIds: '' },
  });

  async function runCreate(form: InvoiceForm): Promise<void> {
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createInvoice({
        caseId: form.caseId || undefined,
        clientId: form.clientId || undefined,
        invoiceNumber: form.invoiceNumber,
        discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
        taxRuleId: form.taxRuleId || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        timeEntryIds: splitIds(form.timeEntryIds),
        feeIds: splitIds(form.feeIds),
        expenseIds: splitIds(form.expenseIds),
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
      <h3>{t('billing.sections.invoice.heading')}</h3>
      <p>{t('billing.sections.invoice.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
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
            label={t('billing.labels.clientId')}
            error={errors.clientId ? t(`form.errors.${errors.clientId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.clientId'),
              ...register('clientId'),
            }}
          />
          <FormField
            label={t('billing.labels.invoiceNumber')}
            error={errors.invoiceNumber ? t(`form.errors.${errors.invoiceNumber.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.invoiceNumber'),
              ...register('invoiceNumber'),
            }}
          />
          <FormField
            label={t('billing.labels.discountAmount')}
            error={errors.discountAmount ? t(`form.errors.${errors.discountAmount.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.amount'),
              ...register('discountAmount'),
            }}
          />
          <FormField
            label={t('billing.labels.taxRuleId')}
            error={errors.taxRuleId ? t(`form.errors.${errors.taxRuleId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.invoiceId'),
              ...register('taxRuleId'),
            }}
          />
          <FormField
            label={t('billing.labels.dueDate')}
            error={errors.dueDate ? t(`form.errors.${errors.dueDate.message}`) : undefined}
            inputProps={{
              type: 'date',
              ...register('dueDate'),
            }}
          />
          <FormField
            label={t('billing.labels.timeEntryIds')}
            error={errors.timeEntryIds ? t(`form.errors.${errors.timeEntryIds.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.invoiceId'),
              ...register('timeEntryIds'),
            }}
          />
          <FormField
            label={t('billing.labels.feeIds')}
            error={errors.feeIds ? t(`form.errors.${errors.feeIds.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.invoiceId'),
              ...register('feeIds'),
            }}
          />
          <FormField
            label={t('billing.labels.expenseIds')}
            error={errors.expenseIds ? t(`form.errors.${errors.expenseIds.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.invoiceId'),
              ...register('expenseIds'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.create')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('billing.result.title')}
            errorTitle={t('billing.result.errorTitle')}
            fields={created ? [
              { label: t('billing.result.id'), value: created.id },
              { label: t('billing.result.total'), value: created.total },
              { label: t('billing.result.status'), value: created.status },
            ] : undefined}
          />
        )}
      </form>
    </div>
  );
}
