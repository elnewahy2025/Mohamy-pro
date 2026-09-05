'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { BillingsClient, type TaxRuleResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const taxSchema = z.object({
  name: z.string().min(1, 'invalid'),
  rate: z.string().min(1, 'invalid'),
});
type TaxForm = z.infer<typeof taxSchema>;

export function TaxSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<TaxRuleResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<TaxForm>({
    resolver: zodResolver(taxSchema),
    defaultValues: { name: '', rate: '' },
  });

  async function runCreate(form: TaxForm): Promise<void> {
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createTaxRule({
        name: form.name,
        rate: Number(form.rate),
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
      <h3>{t('billing.sections.tax.heading')}</h3>
      <p>{t('billing.sections.tax.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('billing.labels.name')}
            error={errors.name ? t(`form.errors.${errors.name.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.name'),
              ...register('name'),
            }}
          />
          <FormField
            label={t('billing.labels.rate')}
            error={errors.rate ? t(`form.errors.${errors.rate.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.rate'),
              ...register('rate'),
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
