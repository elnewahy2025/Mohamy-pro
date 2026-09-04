'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  LegalConfigClient,
  type CountryResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const countrySchema = z.object({
  code: z.string().min(1, 'invalid').max(2, 'tooLong'),
  name: z.string().min(1, 'invalid').max(255, 'tooLong'),
});
type CountryForm = z.infer<typeof countrySchema>;

export function CountrySection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new LegalConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [list, setList] = useState<CountryResult[] | null>(null);
  const [created, setCreated] = useState<CountryResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CountryForm>({
    resolver: zodResolver(countrySchema),
    defaultValues: { code: '', name: '' },
  });

  async function runCreate(form: CountryForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const next = await client.createCountry({ code: form.code, name: form.name });
      setCreated(next);
      setStatus('success');
      reset({ code: '', name: '' });
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
      const result = await client.listCountries();
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
        <span className="settings-icon" aria-hidden="true"><Globe size={18} /></span>
        <div>
          <h2>{t('legalConfig.sections.country.heading')}</h2>
          <p>{t('legalConfig.sections.country.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('legalConfig.labels.code')}
          error={errors.code ? t(`form.errors.${errors.code.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('legalConfig.placeholders.code'),
            ...register('code'),
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
          { label: t('legalConfig.result.code'), value: created.code },
          { label: t('legalConfig.result.name'), value: created.name },
        ] : undefined}
      />
      {list && list.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
            {t('legalConfig.result.count')}: {list.length}
          </div>
          {list.map((item: CountryResult) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{item.name}</span>
              <span>
                <code>{item.code}</code> · {item.status} · <code>{item.id}</code>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
