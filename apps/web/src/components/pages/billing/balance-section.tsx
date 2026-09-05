'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { BillingsClient, type InvoiceBalance } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const balanceSchema = z.object({
  invoiceId: z.string().optional().or(z.literal('')),
  caseId: z.string().optional().or(z.literal('')),
});
type BalanceForm = z.infer<typeof balanceSchema>;

export function BalanceSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [balances, setBalances] = useState<InvoiceBalance[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<BalanceForm>({
    resolver: zodResolver(balanceSchema),
    defaultValues: { invoiceId: '', caseId: '' },
  });

  async function runLoad(form: BalanceForm): Promise<void> {
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setBalances([]);
      const result = await client.readBalances(form.invoiceId || undefined, form.caseId || undefined);
      setBalances(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('billing.sections.balance.heading')}</h3>
      <p>{t('billing.sections.balance.description')}</p>

      <form onSubmit={handleSubmit(runLoad)} className="space-y-6 mt-6">
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
            label={t('billing.labels.caseId')}
            error={errors.caseId ? t(`form.errors.${errors.caseId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.caseId'),
              ...register('caseId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.load')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('billing.result.title')}
            errorTitle={t('billing.result.errorTitle')}
            fields={[{ label: t('billing.result.total'), value: String(balances.length) }]}
          />
        )}

        {status === 'success' && balances.length > 0 && (
          <ul className="mt-4 space-y-2">
            {balances.map((balance) => (
              <li key={balance.invoiceId} className="text-sm">
                {t('billing.result.total')}: {balance.total} — {t('billing.result.outstanding')}: {balance.outstanding}
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
