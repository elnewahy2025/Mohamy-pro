'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { HearingsClient, type HearingResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { EntityPicker } from '@/components/forms/entity-picker';
import { OperationResult } from '@/components/forms/operation-result';

const outcomeSchema = z.object({
  hearingId: z.string().uuid('invalid'),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED']),
  outcome: z.string().max(1000, 'tooLong').optional(),
});
type OutcomeForm = z.infer<typeof outcomeSchema>;

interface Props {
  hearingId?: string;
}

export function HearingOutcomeSection({ hearingId }: Props) {
  const t = useTranslations();
  
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<HearingResult | null>(null);
  
  const client = new HearingsClient();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OutcomeForm>({
    resolver: zodResolver(outcomeSchema),
    defaultValues: { hearingId: hearingId || '', status: 'COMPLETED', outcome: '' },
  });

  async function runCreate(form: OutcomeForm): Promise<void> {
    try {
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
          <Controller
            name="hearingId"
            control={control}
            render={({ field }) => (
              <EntityPicker
                label={t('hearings.labels.caseId')} // Typically this might be 'hearingId', but keeping existing i18n key for now if that's what was used
                placeholder={t('common.search')}
                required
                error={errors.hearingId ? t(`form.errors.${errors.hearingId.message}`) : undefined}
                value={field.value}
                onChange={field.onChange}
                load={async (search) => {
                  const items = await client.listHearings();
                  // For a real app, `search` should be passed to the API if supported, or filtered here
                  return items
                    .filter(h => h.status === 'SCHEDULED')
                    .filter(h => !search || (h.hearingType && h.hearingType.toLowerCase().includes(search.toLowerCase())))
                    .map((h) => ({
                      id: h.id,
                      label: `${new Date(h.date).toLocaleDateString()} - ${h.hearingType || 'Hearing'}`,
                    }));
                }}
              />
            )}
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
