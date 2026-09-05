'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { CommsClient, type MessageConsentResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const consentSchema = z.object({
  clientId: z.string().min(1, 'invalid'),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PHONE', 'INTERNAL', 'PORTAL']),
  status: z.enum(['OPT_IN', 'OPT_OUT']),
});
type ConsentForm = z.infer<typeof consentSchema>;

export function ConsentSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [saved, setSaved] = useState<MessageConsentResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<ConsentForm>({
    resolver: zodResolver(consentSchema),
    defaultValues: { clientId: '', channel: 'EMAIL', status: 'OPT_IN' },
  });

  async function runSave(form: ConsentForm): Promise<void> {
    try {
      const client = new CommsClient();
      setStatus('submitting');
      setSaved(null);
      const result = await client.setConsent({
        clientId: form.clientId,
        channel: form.channel,
        status: form.status,
      });
      setSaved(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('communications.sections.consent.heading')}</h3>
      <p>{t('communications.sections.consent.description')}</p>

      <form onSubmit={handleSubmit(runSave)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('communications.labels.clientId')}
            error={errors.clientId ? t(`form.errors.${errors.clientId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.clientId'),
              ...register('clientId'),
            }}
          />
          <FormSelect
            label={t('communications.labels.channel')}
            error={errors.channel ? t(`form.errors.${errors.channel.message}`) : undefined}
            options={['EMAIL', 'SMS', 'WHATSAPP', 'PHONE', 'INTERNAL', 'PORTAL'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('channel'),
            }}
          />
          <FormSelect
            label={t('communications.labels.status')}
            error={errors.status ? t(`form.errors.${errors.status.message}`) : undefined}
            options={['OPT_IN', 'OPT_OUT'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('status'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('communications.submitting') : t('communications.apply')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('communications.result.title')}
            errorTitle={t('communications.result.errorTitle')}
            fields={saved ? [
              { label: t('communications.result.id'), value: saved.id },
              { label: t('communications.result.status'), value: saved.status },
            ] : undefined}
          />
        )}
      </form>
    </div>
  );
}
