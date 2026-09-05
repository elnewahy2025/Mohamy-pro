'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { CalendarClient, type CalendarSyncConflictResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const conflictsSchema = z.object({
  connectionId: z.string().optional().or(z.literal('')),
  conflictId: z.string().optional().or(z.literal('')),
  resolution: z.enum(['LOCAL_WINS', 'REMOTE_WINS']),
});
type ConflictsForm = z.infer<typeof conflictsSchema>;

export function ConflictsSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [conflicts, setConflicts] = useState<CalendarSyncConflictResult[]>([]);
  const [resolved, setResolved] = useState<CalendarSyncConflictResult | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useRHForm<ConflictsForm>({
    resolver: zodResolver(conflictsSchema),
    defaultValues: { connectionId: '', conflictId: '', resolution: 'LOCAL_WINS' },
  });

  async function runLoad(form: ConflictsForm): Promise<void> {
    try {
      const client = new CalendarClient();
      setStatus('submitting');
      setConflicts([]);
      setResolved(null);
      const result = await client.listConflicts(form.connectionId || undefined);
      setConflicts(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  async function runResolve(): Promise<void> {
    const form = getValues();
    if (!form.conflictId) return;
    try {
      const client = new CalendarClient();
      setStatus('submitting');
      setResolved(null);
      const result = await client.resolveConflict(form.conflictId, {
        resolution: form.resolution,
      });
      setResolved(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('calendar.sections.conflicts.heading')}</h3>
      <p>{t('calendar.sections.conflicts.description')}</p>

      <form onSubmit={handleSubmit(runLoad)} className="space-y-6 mt-6">
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
          <FormField
            label={t('calendar.labels.connectionId')}
            inputProps={{
              type: 'text',
              placeholder: t('calendar.placeholders.connectionId'),
              ...register('conflictId'),
            }}
          />
          <FormSelect
            label={t('calendar.labels.resolution')}
            error={errors.resolution ? t(`form.errors.${errors.resolution.message}`) : undefined}
            options={['LOCAL_WINS', 'REMOTE_WINS'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('resolution'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('calendar.submitting') : t('calendar.load')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => runResolve()}>
            {status === 'submitting' ? t('calendar.submitting') : t('calendar.resolve')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('calendar.result.title')}
            errorTitle={t('calendar.result.errorTitle')}
            fields={resolved ? [
              { label: t('calendar.result.id'), value: resolved.id },
              { label: t('calendar.result.status'), value: resolved.resolution },
            ] : [{ label: t('calendar.result.id'), value: String(conflicts.length) }]}
          />
        )}

        {status === 'success' && conflicts.length > 0 && (
          <ul className="mt-4 space-y-2">
            {conflicts.map((conflict) => (
              <li key={conflict.id} className="text-sm">
                [{conflict.localType}] {conflict.reason} — {conflict.resolution}
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
