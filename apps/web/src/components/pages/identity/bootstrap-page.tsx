'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClient, ApiError, type BootstrapResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const bootstrapSchema = z.object({
  secret: z.string().min(1, 'required'),
});
type BootstrapForm = z.infer<typeof bootstrapSchema>;

export function BootstrapPage(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BootstrapForm>({
    resolver: zodResolver(bootstrapSchema),
    defaultValues: { secret: '' },
  });

  async function onSubmit(form: BootstrapForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const next = await client.bootstrap(form.secret);
      setResult(next);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setSubmitError(error instanceof ApiError ? error : new ApiError(error instanceof Error ? error.message : 'Unknown error', 'INTERNAL', [], 0));
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return <section className="page-section content-page"><p>{t('auth.login.checking')}</p></section>;
  }

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('identity.eyebrow')}</p>
        <h1>{t('identity.bootstrap.title')}</h1>
        <p>{t('identity.bootstrap.description')}</p>
      </div>

      {!user ? (
        <p>{t('auth.login.notAuthenticated')}</p>
      ) : (
        <form
          className="settings-card"
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
        >
          <div className="settings-card-heading">
            <span className="settings-icon" aria-hidden="true"><Rocket size={18} /></span>
            <div><h2>{t('identity.bootstrap.title')}</h2><p>{t('identity.bootstrap.description')}</p></div>
          </div>
          <FormField
            label={t('identity.bootstrap.secretLabel')}
            error={errors.secret ? t(`form.errors.${errors.secret.message}`) : undefined}
            inputProps={{
              type: 'password',
              autoComplete: 'off',
              placeholder: t('identity.bootstrap.secretPlaceholder'),
              ...register('secret'),
            }}
          />
          <div className="form-actions">
            <Button type="submit" variant="default" disabled={submitting}>
              {submitting
                ? t('identity.bootstrap.submitting')
                : t('identity.bootstrap.submit')}
            </Button>
          </div>
        </form>
      )}

      <OperationResult
        status={status}
        successLabel={t('identity.bootstrap.successTitle')}
        successBody={t('identity.bootstrap.successIntro')}
        errorTitle={t('identity.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={
          result
            ? [
                { label: t('identity.bootstrap.tenant'), value: result.name },
                { label: t('identity.bootstrap.slug'), value: result.slug },
                { label: t('identity.bootstrap.organization'), value: result.organizationId },
              ]
            : undefined
        }
      />
    </section>
  );
}