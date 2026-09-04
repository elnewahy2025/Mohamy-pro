'use client';

import { useState, useEffect } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import {
  HearingsClient,
  CasesClient,
  LegalConfigClient,
  type HearingResult,
  type CaseListRow,
  type CourtResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
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
  const { user } = useAuth();
  
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<HearingResult | null>(null);
  
  const [cases, setCases] = useState<CaseListRow[]>([]);
  const [courts, setCourts] = useState<CourtResult[]>([]);

  useEffect(() => {
    if (user) {
      const casesClient = new CasesClient();
      const configClient = new LegalConfigClient();
      casesClient.list().then(res => setCases(res.data)).catch(() => {});
      configClient.listCourts().then(setCourts).catch(() => {});
    }
  }, [user]);

  const {
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
          <FormSelect
            label={t('hearings.labels.caseId')}
            error={errors.caseId ? t(`form.errors.${errors.caseId.message}`) : undefined}
            options={cases.map(c => ({ label: c.caseNumber, value: c.id }))}
            selectProps={{
              ...register('caseId'),
            }}
          />
          <FormSelect
            label={t('hearings.labels.courtId')}
            error={errors.courtId ? t(`form.errors.${errors.courtId.message}`) : undefined}
            options={[{ label: 'No Court', value: '' }, ...courts.map(c => ({ label: c.name, value: c.id }))]}
            selectProps={{
              ...register('courtId'),
            }}
          />
          <FormField
            label={t('hearings.labels.date')}
            error={errors.date ? t(`form.errors.${errors.date.message}`) : undefined}
            inputProps={{
              type: 'date',
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
