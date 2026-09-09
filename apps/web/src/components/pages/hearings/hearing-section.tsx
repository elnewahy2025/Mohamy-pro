'use client';

import { useState } from 'react';
import { useForm as useRHForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import {
  HearingsClient,
  CasesClient,
  LegalConfigClient,
  type HearingResult,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { EntityPicker } from '@/components/forms/entity-picker';
import { OperationResult } from '@/components/forms/operation-result';

const hearingSchema = z.object({
  caseId: z.string().uuid('invalid'),
  courtId: z.string().uuid('invalid').optional().or(z.literal('')),
  date: z.string().min(1, 'invalid'),
  time: z.string().optional(),
  hearingType: z.string().max(255, 'tooLong').optional(),
  notes: z.string().max(1000, 'tooLong').optional(),
});
type HearingForm = z.infer<typeof hearingSchema>;

export function HearingSection() {
  const t = useTranslations();
  
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<HearingResult | null>(null);
  
  const casesClient = new CasesClient();
  const configClient = new LegalConfigClient();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<HearingForm>({
    resolver: zodResolver(hearingSchema),
    defaultValues: { caseId: '', courtId: '', date: '', time: '', hearingType: '', notes: '' },
  });

  async function runCreate(form: HearingForm): Promise<void> {
    try {
      const client = new HearingsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createHearing({
        caseId: form.caseId,
        courtId: form.courtId || undefined,
        date: new Date(form.date).toISOString(),
        time: form.time || undefined,
        hearingType: form.hearingType || undefined,
        notes: form.notes || undefined,
      });
      setCreated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  return (
    <div className="section-card">
      <h3>{t('hearings.sections.schedule')}</h3>
      <p>{t('hearings.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <Controller
            name="caseId"
            control={control}
            render={({ field }) => (
              <EntityPicker
                label={t('hearings.labels.caseId')}
                placeholder={t('common.search')}
                required
                error={errors.caseId ? t(`form.errors.${errors.caseId.message}`) : undefined}
                value={field.value || ''}
                onChange={field.onChange}
                load={async (search) => {
                  return (await casesClient.list(search ? { search } : {})).data.map((c) => ({
                    id: c.id,
                    label: c.caseNumber,
                    sub: c.status,
                  }));
                }}
              />
            )}
          />
          
          <Controller
            name="courtId"
            control={control}
            render={({ field }) => (
              <EntityPicker
                label={t('hearings.labels.courtId')}
                placeholder={t('common.search')}
                error={errors.courtId ? t(`form.errors.${errors.courtId.message}`) : undefined}
                value={field.value || ''}
                onChange={field.onChange}
                load={async (search) => {
                  const courts = await configClient.listCourts();
                  return courts
                    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
                    .map((c) => ({
                      id: c.id,
                      label: c.name,
                    }));
                }}
              />
            )}
          />

          <FormField
            label={t('hearings.labels.date')}
            error={errors.date ? t(`form.errors.${errors.date.message}`) : undefined}
            inputProps={{
              type: 'date',
              required: true,
              ...register('date'),
            }}
          />
          <FormField
            label={t('hearings.labels.time')}
            error={errors.time ? t(`form.errors.${errors.time.message}`) : undefined}
            inputProps={{
              type: 'time',
              ...register('time'),
            }}
          />
          <FormField
            label={t('hearings.labels.hearingType')}
            error={errors.hearingType ? t(`form.errors.${errors.hearingType.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('hearings.placeholders.hearingType'),
              ...register('hearingType'),
            }}
          />
          <FormField
            label={t('hearings.labels.notes')}
            error={errors.notes ? t(`form.errors.${errors.notes.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('hearings.placeholders.notes'),
              ...register('notes'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('hearings.submitting') : t('hearings.schedule')}
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
