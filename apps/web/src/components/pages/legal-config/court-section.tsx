'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  LegalConfigClient,
  type CourtResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const courtSchema = z.object({
  jurisdictionId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  name: z.string().min(1, 'invalid').max(255, 'tooLong'),
  courtType: z.string().max(255, 'tooLong').optional(),
  department: z.string().max(255, 'tooLong').optional(),
});
type CourtForm = z.infer<typeof courtSchema>;

export function CourtSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new LegalConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [list, setList] = useState<CourtResult[] | null>(null);
  const [created, setCreated] = useState<CourtResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourtForm>({
    resolver: zodResolver(courtSchema),
    defaultValues: { jurisdictionId: '', name: '', courtType: '', department: '' },
  });

  async function runCreate(form: CourtForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const next = await client.createCourt({
        jurisdictionId: form.jurisdictionId,
        name: form.name,
        courtType: form.courtType || null,
        department: form.department || null,
      });
      setCreated(next);
      setStatus('success');
      reset({ jurisdictionId: '', name: '', courtType: '', department: '' });
    } catch (error) {
      setStatus('error');
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(error instanceof Error ? error.message : 'Unknown error', 'INTERNAL', [], 0),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function runList(): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.listCourts();
      setList(result);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(error instanceof Error ? error.message : 'Unknown error', 'INTERNAL', [], 0),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true"><Scale size={18} /></span>
        <div>
          <h2>{t('legalConfig.sections.court.heading')}</h2>
          <p>{t('legalConfig.sections.court.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('legalConfig.labels.jurisdictionId')}
          error={errors.jurisdictionId ? t(`form.errors.${errors.jurisdictionId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('legalConfig.placeholders.jurisdictionId'),
            ...register('jurisdictionId'),
          }}
        />
        <FormField
          label={t('legalConfig.labels.name')}
          error={errors.name ? t(`form.errors.${errors.name.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('legalConfig.placeholders.name'),
            ...register('name'),
          }}
        />
        <FormField
          label={t('legalConfig.labels.courtType')}
          error={errors.courtType ? t(`form.errors.${errors.courtType.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('legalConfig.placeholders.courtType'),
            ...register('courtType'),
          }}
        />
        <FormField
          label={t('legalConfig.labels.department')}
          error={errors.department ? t(`form.errors.${errors.department.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('legalConfig.placeholders.department'),
            ...register('department'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void handleSubmit(runCreate)()} disabled={submitting || authLoading || !user}>
          {submitting ? t('legalConfig.submitting') : t('legalConfig.create')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void runList()} disabled={submitting}>
          {submitting ? t('legalConfig.submitting') : t('legalConfig.list')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('legalConfig.result.title')}
        errorTitle={t('legalConfig.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={created ? [
          { label: t('legalConfig.result.id'), value: created.id },
          { label: t('legalConfig.result.name'), value: created.name },
        ] : undefined}
      />
      {list && list.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
            {t('legalConfig.result.count')}: {list.length}
          </div>
          {list.map((item: CourtResult) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{item.name}{item.courtType ? ` — ${item.courtType}` : ''}</span>
              <span>
                {item.status} · <code>{item.id}</code>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
