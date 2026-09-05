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
import { OperationResult } from '@/components/forms/operation-result';

const mappingsSchema = z.object({
  connectionId: z.string().optional().or(z.literal('')),
});
type MappingsForm = z.infer<typeof mappingsSchema>;

export function MappingsSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [mappings, setMappings] = useState<CalendarEventMappingResult[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<MappingsForm>({
    resolver: zodResolver(mappingsSchema),
    defaultValues: { connectionId: '' },
  });

  async function runLoad(form: MappingsForm): Promise<void> {
    try {
      const client = new CalendarClient();
      setStatus('submitting');
      setMappings([]);
      const result = await client.listMappings(form.connectionId || undefined);
      setMappings(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('calendar.sections.mappings.heading')}</h3>
      <p>{t('calendar.sections.mappings.description')}</p>

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
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('calendar.submitting') : t('calendar.load')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('calendar.result.title')}
            errorTitle={t('calendar.result.errorTitle')}
            fields={[{ label: t('calendar.result.id'), value: String(mappings.length) }]}
          />
        )}

        {status === 'success' && mappings.length > 0 && (
          <ul className="mt-4 space-y-2">
            {mappings.map((mapping) => (
              <li key={mapping.id} className="text-sm">
                [{mapping.localType}] {mapping.localId} → {mapping.externalId ?? '—'} ({mapping.direction})
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
