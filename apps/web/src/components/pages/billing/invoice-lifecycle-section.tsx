'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { BillingsClient, type InvoiceResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const lifecycleSchema = z.object({
  invoiceId: z.string().min(1, 'invalid'),
});
type LifecycleForm = z.infer<typeof lifecycleSchema>;

export function InvoiceLifecycleSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<InvoiceResult | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useRHForm<LifecycleForm>({
    resolver: zodResolver(lifecycleSchema),
    defaultValues: { invoiceId: '' },
  });

  async function run(action: 'issue' | 'void' | 'newVersion'): Promise<void> {
    const form = getValues();
    if (!form.invoiceId) return;
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setResult(null);
      const next =
        action === 'issue'
          ? await client.issueInvoice(form.invoiceId)
          : action === 'void'
            ? await client.voidInvoice(form.invoiceId)
            : await client.versionInvoice(form.invoiceId);
      setResult(next);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('billing.sections.lifecycle.heading')}</h3>
      <p>{t('billing.sections.lifecycle.description')}</p>

      <form onSubmit={handleSubmit(() => run('issue'))} className="space-y-6 mt-6">
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
        </div>

        <div className="form-actions form-actions-row">
          <Button type="button" disabled={status === 'submitting'} onClick={() => run('issue')}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.issue')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => run('void')}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.void')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => run('newVersion')}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.newVersion')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('billing.result.title')}
            errorTitle={t('billing.result.errorTitle')}
            fields={result ? [
              { label: t('billing.result.id'), value: result.id },
              { label: t('billing.result.status'), value: result.status },
            ] : undefined}
          />
        )}
      </form>
    </div>
  );
}
