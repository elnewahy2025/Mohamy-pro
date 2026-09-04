'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { HearingsClient, type HearingResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const outcomeSchema = z.object({
  hearingId: z.string().uuid('invalid'),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED']),
  outcome: z.string().max(1000, 'tooLong').optional(),
});
type OutcomeForm = z.infer<typeof outcomeSchema>;

export function HearingOutcomeSection() {
  const t = useTranslations();
  const { user } = useAuth();
  
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<HearingResult | null>(null);
  
  const [hearings, setHearings] = useState<HearingResult[]>([]);

  useEffect(() => {
    if (user) {
      const client = new HearingsClient();
      client.listHearings().then(setHearings).catch(() => {});
    }
  }, [user]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OutcomeForm>({
    resolver: zodResolver(outcomeSchema),
    defaultValues: { hearingId: '', status: 'COMPLETED', outcome: '' },
  });

  async function runCreate(form: OutcomeForm): Promise<void> {
    try {
      const client = new HearingsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.recordOutcome(form.hearingId, {
        status: form.status,
        outcome: form.outcome || undefined,
      });
      setCreated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  return (
    <div className="section-card">
      <h3>{t('hearings.sections.outcome')}</h3>
      <p>{t('hearings.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormSelect
            label={t('hearings.labels.caseId')}
            error={errors.hearingId ? t(`form.errors.${errors.hearingId.message}`) : undefined}
            options={hearings.filter(h => h.status === 'SCHEDULED').map(h => ({
              label: `${new Date(h.date).toLocaleDateString()} - ${h.hearingType || 'Hearing'}`,
              value: h.id
            }))}
            selectProps={{
              ...register('hearingId'),
            }}
          />
          <FormSelect
            label={t('hearings.labels.status')}
            error={errors.status ? t(`form.errors.${errors.status.message}`) : undefined}
            options={[
              { label: t('common.enums.SCHEDULED') || 'Scheduled', value: 'SCHEDULED' },
              { label: t('common.enums.COMPLETED') || 'Completed', value: 'COMPLETED' },
              { label: t('common.enums.POSTPONED') || 'Postponed', value: 'POSTPONED' },
              { label: t('common.enums.CANCELLED') || 'Cancelled', value: 'CANCELLED' },
            ]}
            selectProps={{
              ...register('status'),
            }}
          />
          <FormField
            label={t('hearings.labels.outcome')}
            error={errors.outcome ? t(`form.errors.${errors.outcome.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('hearings.placeholders.notes'),
              ...register('outcome'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('hearings.submitting') : t('hearings.recordOutcome')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('hearings.result.title')}
            errorTitle={t('hearings.result.errorTitle')}
            fields={created ? [{ label: t('hearings.result.id'), value: created.id }] : undefined}
          />
        )}
      </form>
    </div>
  );
}
