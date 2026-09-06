'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import { NotificationsClient } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';
import type { ApiError } from '@/lib/api';

const preferencesSchema = z.object({
  channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH']),
  enabled: z.enum(['true', 'false']),
  quietStart: z.string().optional().or(z.literal('')),
  quietEnd: z.string().optional().or(z.literal('')),
});
type PreferencesForm = z.infer<typeof preferencesSchema>;

export function PreferencesSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new NotificationsClient());
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<PreferencesForm>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: { channel: 'IN_APP', enabled: 'true', quietStart: '', quietEnd: '' },
  });

  async function runSave(form: PreferencesForm): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      await client.setPreference({
        channel: form.channel,
        enabled: form.enabled === 'true',
        quietStart: form.quietStart || undefined,
        quietEnd: form.quietEnd || undefined,
      });
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  if (!user) {
    return (
      <div className="section-card">
        <p>{t('common.signInRequired')}</p>
      </div>
    );
  }

  return (
    <div className="section-card">
      <h3>{t('notifications.sections.preferences.heading')}</h3>
      <p>{t('notifications.sections.preferences.description')}</p>

      <form onSubmit={handleSubmit(runSave)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormSelect
            label={t('notifications.labels.channel')}
            error={errors.channel ? t(`form.errors.${errors.channel.message}`) : undefined}
            options={['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('channel'),
            }}
          />
          <FormSelect
            label={t('notifications.labels.enabled')}
            error={errors.enabled ? t(`form.errors.${errors.enabled.message}`) : undefined}
            options={[
              { label: 'true', value: 'true' },
              { label: 'false', value: 'false' },
            ]}
            selectProps={{
              ...register('enabled'),
            }}
          />
          <FormField
            label={t('notifications.labels.quietStart')}
            error={errors.quietStart ? t(`form.errors.${errors.quietStart.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('notifications.placeholders.quietStart'),
              ...register('quietStart'),
            }}
          />
          <FormField
            label={t('notifications.labels.quietEnd')}
            error={errors.quietEnd ? t(`form.errors.${errors.quietEnd.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('notifications.placeholders.quietEnd'),
              ...register('quietEnd'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('notifications.submitting') : t('notifications.save')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('notifications.result.title')}
            errorTitle={t('notifications.result.errorTitle')}
            onError={submitError?.message}
            errorCode={submitError?.code}
          />
        )}
      </form>
    </div>
  );
}
