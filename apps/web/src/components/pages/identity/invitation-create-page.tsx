'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClient, ApiError, type InvitationCreateResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const invitationCreateSchema = z.object({
  intendedEmail: z
    .string()
    .trim()
    .max(320)
    .email('invalidEmail')
    .or(z.literal(''))
    .optional(),
  intendedProviderSubject: z.string().trim().max(255).optional(),
  requestedRoleKeys: z.string().trim().min(1, 'atLeastOneRole'),
}).refine((data) => (data.intendedEmail && data.intendedEmail.trim().length > 0) || (data.intendedProviderSubject && data.intendedProviderSubject.trim().length > 0), {
  message: 'invalid',
  path: ['roleKeys'],
});
type InvitationCreateForm = z.infer<typeof invitationCreateSchema>;

export function InvitationCreatePage(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<InvitationCreateResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvitationCreateForm>({
    resolver: zodResolver(invitationCreateSchema),
    defaultValues: {
      intendedEmail: '',
      intendedProviderSubject: '',
      requestedRoleKeys: '',
    },
  });

  async function onSubmit(form: InvitationCreateForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const next = await client.createInvitation({
        intendedEmail: form.intendedEmail && form.intendedEmail.length > 0 ? form.intendedEmail : undefined,
        intendedProviderSubject: form.intendedProviderSubject && form.intendedProviderSubject.length > 0 ? form.intendedProviderSubject : undefined,
        requestedRoleKeys: form.requestedRoleKeys.split(',').map((key) => key.trim()).filter(Boolean),
      });
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
        <h1>{t('identity.invitation.createTitle')}</h1>
        <p>{t('identity.invitation.createDescription')}</p>
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
            <span className="settings-icon" aria-hidden="true"><UserPlus size={18} /></span>
            <div><h2>{t('identity.invitation.createTitle')}</h2><p>{t('identity.invitation.bindingHint')}</p></div>
          </div>
          <FormField
            label={t('identity.invitation.providerSubjectLabel')}
            error={errors.intendedProviderSubject ? t(`form.errors.${errors.intendedProviderSubject.message}`) : undefined}
            inputProps={{
              type: 'text',
              autoComplete: 'off',
              placeholder: t('identity.invitation.providerSubjectPlaceholder'),
              ...register('intendedProviderSubject'),
            }}
          />
          <FormField
            label={t('identity.invitation.emailLabel')}
            error={errors.intendedEmail ? t(`form.errors.${errors.intendedEmail.message}`) : undefined}
            inputProps={{
              type: 'email',
              autoComplete: 'email',
              placeholder: t('identity.invitation.emailPlaceholder'),
              ...register('intendedEmail'),
            }}
          />
          <FormField
            label={t('identity.invitation.roleKeysLabel')}
            error={
              errors.requestedRoleKeys
                ? t(`form.errors.${errors.requestedRoleKeys.message}`)
                : undefined
            }
            hint={t('identity.invitation.roleKeysPlaceholder')}
            inputProps={{
              type: 'text',
              placeholder: t('identity.invitation.roleKeysPlaceholder'),
              ...register('requestedRoleKeys'),
            }}
          />
          <div className="form-actions">
            <Button type="submit" variant="default" disabled={submitting}>
              {submitting
                ? t('identity.invitation.submittingCreate')
                : t('identity.invitation.submitCreate')}
            </Button>
          </div>
        </form>
      )}

      <OperationResult
        status={status}
        successLabel={t('identity.invitation.createSuccessTitle')}
        successBody={t('identity.invitation.createSuccessBody')}
        errorTitle={t('identity.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={result ? [{ label: t('identity.invitation.invitationToken'), value: result.token }] : undefined}
      />
    </section>
  );
}