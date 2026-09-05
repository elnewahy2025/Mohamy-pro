'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClient, ApiError, type MembershipRoleResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const assignmentSchema = z.object({
  roleId: z.string().min(1, 'invalid'),
  membershipId: z.string().min(1, 'invalid'),
});
type AssignmentForm = z.infer<typeof assignmentSchema>;

export function RoleAssignmentSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<MembershipRoleResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    getValues,
    formState: { errors },
  } = useForm<AssignmentForm>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { roleId: '', membershipId: '' },
  });

  async function runAssign(): Promise<void> {
    const form = getValues();
    if (!form.roleId || !form.membershipId) return;
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setResult(await client.assignRole(form.roleId, { membershipId: form.membershipId }));
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

  async function runRevoke(): Promise<void> {
    const form = getValues();
    if (!form.roleId || !form.membershipId) return;
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setResult(await client.revokeRoleAssignment(form.roleId, { membershipId: form.membershipId }));
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
        <div>
          <h2>{t('identity.roles.sections.assign')}</h2>
          <p>{t('identity.roles.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('identity.roles.roleIdLabel')}
          error={errors.roleId ? t(`form.errors.${errors.roleId.message}`) : undefined}
          inputProps={{ type: 'text', autoComplete: 'off', placeholder: t('identity.roles.roleIdPlaceholder'), ...register('roleId') }}
        />
        <FormField
          label={t('identity.roles.membershipIdLabel')}
          error={errors.membershipId ? t(`form.errors.${errors.membershipId.message}`) : undefined}
          inputProps={{ type: 'text', autoComplete: 'off', placeholder: t('identity.roles.membershipIdPlaceholder'), ...register('membershipId') }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void runAssign()} disabled={submitting || authLoading || !user}>
          {submitting ? t('identity.roles.submitting') : t('identity.roles.assign')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void runRevoke()} disabled={submitting}>
          {submitting ? t('identity.roles.submitting') : t('identity.roles.revokeAssignment')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('identity.roles.resultTitle')}
        errorTitle={t('identity.roles.resultTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={result ? [{ label: t('identity.roles.membershipIdLabel'), value: result.membershipId }] : undefined}
      />
    </form>
  );
}
