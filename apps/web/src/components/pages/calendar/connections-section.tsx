'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { CalendarClient, type CalendarConnectionResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const connectionSchema = z.object({
  provider: z.enum(['GOOGLE', 'MICROSOFT']),
  accountRef: z.string().min(1, 'invalid'),
  toggleId: z.string().optional().or(z.literal('')),
});
type ConnectionForm = z.infer<typeof connectionSchema>;

export function ConnectionsSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<CalendarConnectionResult | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useRHForm<ConnectionForm>({
    resolver: zodResolver(connectionSchema),
    defaultValues: { provider: 'GOOGLE', accountRef: '', toggleId: '' },
  });

  async function runCreate(form: ConnectionForm): Promise<void> {
    try {
      const client = new CalendarClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createConnection({
        provider: form.provider,
        accountRef: form.accountRef,
      });
      setCreated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  async function runToggle(enable: boolean): Promise<void> {
    const id = getValues().toggleId;
    if (!id) return;
    try {
      const client = new CalendarClient();
      setStatus('submitting');
      setCreated(null);
      const result = enable
        ? await client.enableConnection(id)
        : await client.disableConnection(id);
      setCreated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('calendar.sections.connections.heading')}</h3>
      <p>{t('calendar.sections.connections.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormSelect
            label={t('calendar.labels.provider')}
            error={errors.provider ? t(`form.errors.${errors.provider.message}`) : undefined}
            options={['GOOGLE', 'MICROSOFT'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('provider'),
            }}
          />
          <FormField
            label={t('calendar.labels.accountRef')}
            error={errors.accountRef ? t(`form.errors.${errors.accountRef.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('calendar.placeholders.accountRef'),
              ...register('accountRef'),
            }}
          />
          <FormField
            label={t('calendar.labels.connectionId')}
            inputProps={{
              type: 'text',
              placeholder: t('calendar.placeholders.connectionId'),
              ...register('toggleId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('calendar.submitting') : t('calendar.create')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => runToggle(true)}>
            {status === 'submitting' ? t('calendar.submitting') : t('calendar.enable')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => runToggle(false)}>
            {status === 'submitting' ? t('calendar.submitting') : t('calendar.disable')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('calendar.result.title')}
            errorTitle={t('calendar.result.errorTitle')}
            fields={created ? [
              { label: t('calendar.result.id'), value: created.id },
              { label: t('calendar.result.status'), value: created.status },
            ] : undefined}
          />
        )}
      </form>
    </div>
  );
}
