'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { BillingsClient, type ExpenseResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const expenseSchema = z.object({
  caseId: z.string().optional().or(z.literal('')),
  description: z.string().min(1, 'invalid'),
  amount: z.string().min(1, 'invalid'),
});
type ExpenseForm = z.infer<typeof expenseSchema>;

export function ExpenseSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<ExpenseResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { caseId: '', description: '', amount: '' },
  });

  async function runCreate(form: ExpenseForm): Promise<void> {
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createExpense({
        caseId: form.caseId || undefined,
        description: form.description,
        amount: Number(form.amount),
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
      <h3>{t('billing.sections.expense.heading')}</h3>
      <p>{t('billing.sections.expense.description')}</p>

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
            label={t('billing.labels.description')}
            error={errors.description ? t(`form.errors.${errors.description.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.description'),
              ...register('description'),
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
            fields={created ? [{ label: t('billing.result.id'), value: created.id }] : undefined}
          />
        )}
      </form>
    </div>
  );
}
