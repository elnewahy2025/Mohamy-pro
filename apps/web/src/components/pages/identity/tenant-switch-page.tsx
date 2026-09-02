'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRightLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClient, ApiError, type TenantSwitchResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const UUIDV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const tenantSwitchSchema = z.object({
  tenantId: z.string().regex(UUIDV4, 'invalidUuid'),
});
type TenantSwitchForm = z.infer<typeof tenantSwitchSchema>;

export function TenantSwitchPage(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<TenantSwitchResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TenantSwitchForm>({
    resolver: zodResolver(tenantSwitchSchema),
    defaultValues: { tenantId: '' },
  });

  async function onSubmit(form: TenantSwitchForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const next = await client.tenantSwitch(form.tenantId);
      setResult(next);
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

  if (authLoading) {
    return <section className="page-section content-page"><p>{t('auth.login.checking')}</p></section>;
  }

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('identity.eyebrow')}</p>
        <h1>{t('identity.tenantSwitch.title')}</h1>
        <p>{t('identity.tenantSwitch.description')}</p>
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
            <span className="settings-icon" aria-hidden="true"><ArrowRightLeft size={18} /></span>
            <div><h2>{t('identity.tenantSwitch.title')}</h2><p>{t('identity.tenantSwitch.description')}</p></div>
          </div>
          <FormField
            label={t('identity.tenantSwitch.tenantIdLabel')}
            error={errors.tenantId ? t(`form.errors.${errors.tenantId.message}`) : undefined}
            hint={t('identity.tenantSwitch.tenantIdPlaceholder')}
            inputProps={{
              type: 'text',
              inputMode: 'text',
              placeholder: t('identity.tenantSwitch.tenantIdPlaceholder'),
              ...register('tenantId'),
            }}
          />
          <div className="form-actions">
            <Button type="submit" variant="default" disabled={submitting}>
              {submitting
                ? t('identity.tenantSwitch.submitting')
                : t('identity.tenantSwitch.submit')}
            </Button>
          </div>
        </form>
      )}

      <OperationResult
        status={status}
        successLabel={t('identity.tenantSwitch.successTitle')}
        errorTitle={t('identity.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={
          result
            ? [
                { label: t('identity.tenantSwitch.activeTenant'), value: result.name },
                { label: t('identity.bootstrap.slug'), value: result.slug },
              ]
            : undefined
        }
      />
    </section>
  );
}