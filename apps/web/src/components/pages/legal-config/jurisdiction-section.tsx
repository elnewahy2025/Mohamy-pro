'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  LegalConfigClient,
  type JurisdictionResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const jurisdictionSchema = z.object({
  countryId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  name: z.string().min(1, 'invalid').max(255, 'tooLong'),
});
type JurisdictionForm = z.infer<typeof jurisdictionSchema>;

export function JurisdictionSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new LegalConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [list, setList] = useState<JurisdictionResult[] | null>(null);
  const [created, setCreated] = useState<JurisdictionResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JurisdictionForm>({
    resolver: zodResolver(jurisdictionSchema),
    defaultValues: { countryId: '', name: '' },
  });

  async function runCreate(form: JurisdictionForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const next = await client.createJurisdiction({ countryId: form.countryId, name: form.name });
      setCreated(next);
      setStatus('success');
      reset({ countryId: '', name: '' });
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
      const result = await client.listJurisdictions();
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
        <span className="settings-icon" aria-hidden="true"><Landmark size={18} /></span>
        <div>
          <h2>{t('legalConfig.sections.jurisdiction.heading')}</h2>
          <p>{t('legalConfig.sections.jurisdiction.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('legalConfig.labels.countryId')}
          error={errors.countryId ? t(`form.errors.${errors.countryId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('legalConfig.placeholders.countryId'),
            ...register('countryId'),
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
          { label: t('legalConfig.result.name'), value: created.name },
        ] : undefined}
      />
      {list && list.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
            {t('legalConfig.result.count')}: {list.length}
          </div>
          {list.map((item: JurisdictionResult) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{item.name}</span>
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
