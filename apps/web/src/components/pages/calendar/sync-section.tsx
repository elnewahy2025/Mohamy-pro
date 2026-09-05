'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { CalendarClient, type CalendarEventMappingResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const syncSchema = z.object({
  connectionId: z.string().min(1, 'invalid'),
  localType: z.enum(['HEARING', 'DEADLINE', 'TASK']),
  localId: z.string().min(1, 'invalid'),
});
type SyncForm = z.infer<typeof syncSchema>;

export function SyncSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [mapped, setMapped] = useState<CalendarEventMappingResult | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useRHForm<SyncForm>({
    resolver: zodResolver(syncSchema),
    defaultValues: { connectionId: '', localType: 'HEARING', localId: '' },
  });

  async function runPush(form: SyncForm): Promise<void> {
    try {
      const client = new CalendarClient();
      setStatus('submitting');
      setMapped(null);
      const result = await client.pushEvent({
        connectionId: form.connectionId,
        localType: form.localType,
        localId: form.localId,
      });
      setMapped(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  async function runPull(): Promise<void> {
    const form = getValues();
    if (!form.connectionId) return;
    try {
      const client = new CalendarClient();
      setStatus('submitting');
      setMapped(null);
      await client.pullChanges({ connectionId: form.connectionId });
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('calendar.sections.sync.heading')}</h3>
      <p>{t('calendar.sections.sync.description')}</p>

      <form onSubmit={handleSubmit(runPush)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('calendar.labels.connectionId')}
            error={errors.connectionId ? t(`form.errors.${errors.connectionId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('calendar.placeholders.connectionId'),
              ...register('connectionId'),
            }}
          />
          <FormSelect
            label={t('calendar.labels.localType')}
            error={errors.localType ? t(`form.errors.${errors.localType.message}`) : undefined}
            options={['HEARING', 'DEADLINE', 'TASK'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('localType'),
            }}
          />
          <FormField
            label={t('calendar.labels.localId')}
            error={errors.localId ? t(`form.errors.${errors.localId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('calendar.placeholders.localId'),
              ...register('localId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('calendar.submitting') : t('calendar.push')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => runPull()}>
            {status === 'submitting' ? t('calendar.submitting') : t('calendar.pull')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('calendar.result.title')}
            errorTitle={t('calendar.result.errorTitle')}
            fields={mapped ? [{ label: t('calendar.result.id'), value: mapped.id }] : undefined}
          />
        )}
      </form>
    </div>
  );
}
