'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { BillingsClient, type FeeResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const feeSchema = z.object({
  caseId: z.string().optional().or(z.literal('')),
  clientId: z.string().optional().or(z.literal('')),
  kind: z.enum(['FIXED', 'HOURLY', 'RETAINER', 'MILESTONE']),
  description: z.string().min(1, 'invalid'),
  amount: z.string().min(1, 'invalid'),
});
type FeeForm = z.infer<typeof feeSchema>;

export function FeeSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<FeeResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<FeeForm>({
    resolver: zodResolver(feeSchema),
    defaultValues: { caseId: '', clientId: '', kind: 'FIXED', description: '', amount: '' },
  });

  async function runCreate(form: FeeForm): Promise<void> {
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createFee({
        caseId: form.caseId || undefined,
        clientId: form.clientId || undefined,
        kind: form.kind,
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
      <h3>{t('billing.sections.fee.heading')}</h3>
      <p>{t('billing.sections.fee.description')}</p>

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
          <FormSelect
            label={t('billing.labels.kind')}
            error={errors.kind ? t(`form.errors.${errors.kind.message}`) : undefined}
            options={['FIXED', 'HOURLY', 'RETAINER', 'MILESTONE'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('kind'),
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
