'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { CalendarClient, type AgendaItem } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const agendaSchema = z.object({
  from: z.string().optional().or(z.literal('')),
  to: z.string().optional().or(z.literal('')),
});
type AgendaForm = z.infer<typeof agendaSchema>;

export function AgendaSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [items, setItems] = useState<AgendaItem[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<AgendaForm>({
    resolver: zodResolver(agendaSchema),
    defaultValues: { from: '', to: '' },
  });

  async function runLoad(form: AgendaForm): Promise<void> {
    try {
      const client = new CalendarClient();
      setStatus('submitting');
      setItems([]);
      const result = await client.readAgenda(
        form.from ? new Date(form.from).toISOString() : undefined,
        form.to ? new Date(form.to).toISOString() : undefined,
      );
      setItems(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('calendar.sections.agenda.heading')}</h3>
      <p>{t('calendar.sections.agenda.description')}</p>

      <form onSubmit={handleSubmit(runLoad)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('calendar.labels.from')}
            error={errors.from ? t(`form.errors.${errors.from.message}`) : undefined}
            inputProps={{
              type: 'date',
              ...register('from'),
            }}
          />
          <FormField
            label={t('calendar.labels.to')}
            error={errors.to ? t(`form.errors.${errors.to.message}`) : undefined}
            inputProps={{
              type: 'date',
              ...register('to'),
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
            fields={[{ label: t('calendar.result.id'), value: String(items.length) }]}
          />
        )}

        {status === 'success' && items.length > 0 && (
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="text-sm">
                [{item.kind}] {item.title} — {new Date(item.startsAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
