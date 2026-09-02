'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { DoorOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClient, ApiError, type InvitationAcceptResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const invitationAcceptSchema = z.object({
  token: z.string().trim().min(1, 'invalidToken'),
});
type InvitationAcceptForm = z.infer<typeof invitationAcceptSchema>;

export function InvitationAcceptPage(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<InvitationAcceptResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvitationAcceptForm>({
    resolver: zodResolver(invitationAcceptSchema),
    defaultValues: { token: '' },
  });

  async function onSubmit(form: InvitationAcceptForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const next = await client.acceptInvitation(form.token.trim());
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
        <h1>{t('identity.invitation.acceptTitle')}</h1>
        <p>{t('identity.invitation.acceptDescription')}</p>
      </div>

      <form
        className="settings-card"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
      >
        <div className="settings-card-heading">
          <span className="settings-icon" aria-hidden="true"><DoorOpen size={18} /></span>
          <div><h2>{t('identity.invitation.acceptTitle')}</h2><p>{t('identity.invitation.acceptDescription')}</p></div>
        </div>
        <FormField
          label={t('identity.invitation.invitationToken')}
          error={errors.token ? t(`form.errors.${errors.token.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('identity.invitation.invitationToken'),
            ...register('token'),
          }}
        />
        <div className="form-actions">
          <Button type="submit" variant="default" disabled={submitting}>
            {submitting
              ? t('identity.invitation.submittingAccept')
              : t('identity.invitation.submitAccept')}
          </Button>
        </div>
      </form>

      <OperationResult
        status={status}
        successLabel={t('identity.invitation.acceptSuccessTitle')}
        successBody={t('identity.invitation.acceptSuccessBody')}
        errorTitle={t('identity.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={result ? [{ label: t('identity.membershipAdmin.resultStatus'), value: result.status }] : undefined}
      />
    </section>
  );
}