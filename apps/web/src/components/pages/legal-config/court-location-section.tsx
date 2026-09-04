'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  LegalConfigClient,
  type CourtLocationResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const courtLocationSchema = z.object({
  courtId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  name: z.string().min(1, 'invalid').max(255, 'tooLong'),
  city: z.string().max(255, 'tooLong').optional(),
  address: z.string().max(255, 'tooLong').optional(),
});
type CourtLocationForm = z.infer<typeof courtLocationSchema>;

export function CourtLocationSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new LegalConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [list, setList] = useState<CourtLocationResult[] | null>(null);
  const [created, setCreated] = useState<CourtLocationResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [listCourtId, setListCourtId] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourtLocationForm>({
    resolver: zodResolver(courtLocationSchema),
    defaultValues: { courtId: '', name: '', city: '', address: '' },
  });

  async function runCreate(form: CourtLocationForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const next = await client.createCourtLocation({
        courtId: form.courtId,
        name: form.name,
        city: form.city || null,
        address: form.address || null,
      });
      setCreated(next);
      setStatus('success');
      reset({ courtId: '', name: '', city: '', address: '' });
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
    if (!listCourtId) {
      setStatus('error');
      setSubmitError(new ApiError('legalConfig.labels.courtId is required', 'VALIDATION', [], 0));
      return;
    }
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.listCourtLocations(listCourtId);
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
        <span className="settings-icon" aria-hidden="true"><MapPin size={18} /></span>
        <div>
          <h2>{t('legalConfig.sections.courtLocation.heading')}</h2>
          <p>{t('legalConfig.sections.courtLocation.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('legalConfig.labels.courtId')}
          error={errors.courtId ? t(`form.errors.${errors.courtId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('legalConfig.placeholders.courtId'),
            ...register('courtId'),
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
          label={t('legalConfig.labels.city')}
          error={errors.city ? t(`form.errors.${errors.city.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('legalConfig.placeholders.city'),
            ...register('city'),
          }}
        />
        <FormField
          label={t('legalConfig.labels.address')}
          error={errors.address ? t(`form.errors.${errors.address.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('legalConfig.placeholders.address'),
            ...register('address'),
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
      <FormField
        label={`${t('legalConfig.labels.courtId')} — ${t('legalConfig.list')}`}
        inputProps={{
          type: 'text',
          autoComplete: 'off',
          placeholder: t('legalConfig.placeholders.courtId'),
          value: listCourtId,
          onChange: (e) => setListCourtId(e.target.value),
        }}
      />
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
          {list.map((item: CourtLocationResult) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{item.name}{item.city ? ` — ${item.city}` : ''}</span>
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
