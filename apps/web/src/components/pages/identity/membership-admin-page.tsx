'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiClient,
  ApiError,
  type MembershipAdminRequest,
  type MembershipAdminResult,
  type MembershipReinstateRequest,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const UUIDV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const membershipAdminSchema = z.object({
  membershipId: z.string().regex(UUIDV4, 'invalidUuid'),
  reason: z.string().max(200, 'tooLong').optional(),
  activeUntil: z.string().max(64, 'invalidDate').optional(),
  activeFrom: z.string().max(64, 'invalidDate').optional(),
});
type MembershipAdminForm = z.infer<typeof membershipAdminSchema>;

type ActionKey = 'suspend' | 'expire' | 'remove' | 'reinstate';

export function MembershipAdminPage(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<MembershipAdminResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MembershipAdminForm>({
    resolver: zodResolver(membershipAdminSchema),
    defaultValues: { membershipId: '', reason: '', activeUntil: '', activeFrom: '' },
  });

  const standardPayload = (form: MembershipAdminForm): MembershipAdminRequest => ({
    membershipId: form.membershipId,
    reason: form.reason || undefined,
    activeUntil: toIso(form.activeUntil),
  });

  const reinstatePayload = (
    form: MembershipAdminForm,
  ): MembershipReinstateRequest => ({
    membershipId: form.membershipId,
    reason: form.reason || undefined,
    activeFrom: toIso(form.activeFrom),
    activeUntil: toIso(form.activeUntil),
  });

  function toIso(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  async function run(
    action: ActionKey,
    form: MembershipAdminForm,
  ): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: MembershipAdminResult;
      switch (action) {
        case 'suspend':
          next = await client.suspendMembership(standardPayload(form));
          break;
        case 'expire':
          next = await client.expireMembership(standardPayload(form));
          break;
        case 'remove':
          next = await client.removeMembership(standardPayload(form));
          break;
        case 'reinstate':
          next = await client.reinstateMembership(reinstatePayload(form));
          break;
      }
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

  async function trigger(action: ActionKey): Promise<void> {
    await handleSubmit((form) => run(action, form))();
  }

  if (authLoading) {
    return <section className="page-section content-page"><p>{t('auth.login.checking')}</p></section>;
  }

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('identity.eyebrow')}</p>
        <h1>{t('identity.membershipAdmin.title')}</h1>
        <p>{t('identity.membershipAdmin.description')}</p>
      </div>

      {!user ? (
        <p>{t('auth.login.notAuthenticated')}</p>
      ) : (
        <form className="settings-card" noValidate>
          <div className="settings-card-heading">
            <span className="settings-icon" aria-hidden="true"><Users size={18} /></span>
            <div><h2>{t('identity.membershipAdmin.title')}</h2><p>{t('identity.membershipAdmin.description')}</p></div>
          </div>
          <div className="form-grid">
            <FormField
              label={t('identity.membershipAdmin.membershipIdLabel')}
              error={errors.membershipId ? t(`form.errors.${errors.membershipId.message}`) : undefined}
              inputProps={{
                type: 'text',
                autoComplete: 'off',
                placeholder: t('identity.membershipAdmin.membershipIdPlaceholder'),
                ...register('membershipId'),
              }}
            />
            <FormField
              label={t('identity.membershipAdmin.reasonLabel')}
              error={errors.reason ? t(`form.errors.${errors.reason.message}`) : undefined}
              inputProps={{
                type: 'text',
                placeholder: t('identity.membershipAdmin.reasonPlaceholder'),
                ...register('reason'),
              }}
            />
            <FormField
              label={t('identity.membershipAdmin.activeUntilLabel')}
              error={errors.activeUntil ? t(`form.errors.${errors.activeUntil.message}`) : undefined}
              inputProps={{
                type: 'datetime-local',
                ...register('activeUntil'),
              }}
            />
            <FormField
              label={t('identity.membershipAdmin.activeFromLabel')}
              error={errors.activeFrom ? t(`form.errors.${errors.activeFrom.message}`) : undefined}
              inputProps={{
                type: 'datetime-local',
                ...register('activeFrom'),
              }}
            />
          </div>
          <div className="form-actions form-actions-row">
            <Button type="button" variant="outline" onClick={() => void trigger('suspend')} disabled={submitting}>
              {submitting ? t('identity.membershipAdmin.submitting') : t('identity.membershipAdmin.suspend')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void trigger('expire')} disabled={submitting}>
              {submitting ? t('identity.membershipAdmin.submitting') : t('identity.membershipAdmin.expire')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void trigger('remove')} disabled={submitting}>
              {submitting ? t('identity.membershipAdmin.submitting') : t('identity.membershipAdmin.remove')}
            </Button>
            <Button type="button" variant="default" onClick={() => void trigger('reinstate')} disabled={submitting}>
              {submitting ? t('identity.membershipAdmin.submitting') : t('identity.membershipAdmin.reinstate')}
            </Button>
          </div>
        </form>
      )}

      <OperationResult
        status={status}
        successLabel={t('identity.membershipAdmin.resultTitle')}
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