'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Siren } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  BreakGlassClient,
  CasesClient,
  type BreakGlassActivationResult,
  type CaseListRow,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';
import { EntityPicker } from '@/components/forms/entity-picker';

const activateSchema = z.object({
  subjectMembershipId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  caseId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  reason: z.string().min(1, 'invalid').max(1000, 'tooLong'),
  endsAt: z.string().optional(),
});
type ActivateForm = z.infer<typeof activateSchema>;

export function CaseBreakGlassSection({
  selected,
}: {
  selected: CaseListRow | null;
}): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new BreakGlassClient());
  const [casesClient] = useState(() => new CasesClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [activated, setActivated] = useState<BreakGlassActivationResult | null>(
    null,
  );
  const [grants, setGrants] = useState<BreakGlassActivationResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ActivateForm>({
    resolver: zodResolver(activateSchema),
    defaultValues: {
      subjectMembershipId: '',
      caseId: '',
      reason: '',
      endsAt: '',
    },
  });

  useEffect(() => {
    if (selected) {
      setValue('caseId', selected.id, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  async function fail(error: unknown): Promise<void> {
    setStatus('error');
    setSubmitError(
      error instanceof ApiError
        ? error
        : new ApiError(
            error instanceof Error ? error.message : 'Unknown error',
            'INTERNAL',
            [],
            0,
          ),
    );
  }

  async function runActivate(form: ActivateForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.activate({
        subjectMembershipId: form.subjectMembershipId,
        caseId: form.caseId,
        reason: form.reason,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      });
      setActivated(result);
      setStatus('success');
    } catch (error) {
      await fail(error);
    } finally {
      setSubmitting(false);
    }
  }

  async function runList(): Promise<void> {
    const caseId = getValues().caseId;
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setGrants(await client.listActive(caseId || undefined));
      setStatus('success');
    } catch (error) {
      await fail(error);
    } finally {
      setSubmitting(false);
    }
  }

  async function runRevoke(id: string): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      await client.revoke(id);
      setGrants((prev) => prev.filter((g) => g.id !== id));
      setStatus('success');
    } catch (error) {
      await fail(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <Siren size={18} />
        </span>
        <div>
          <h2>{t('cases.sections.breakglass')}</h2>
          <p>{t('cases.entity.breakglass.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('cases.labels.subjectMembershipId')}
          error={
            errors.subjectMembershipId
              ? t(`form.errors.${errors.subjectMembershipId.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.subjectMembershipId'),
            ...register('subjectMembershipId'),
          }}
        />
        <EntityPicker
          label={t('cases.labels.id')}
          placeholder={t('cases.placeholders.id')}
          required
          error={
            errors.caseId
              ? t(`form.errors.${errors.caseId.message}`)
              : undefined
          }
          value={watch('caseId') ?? ''}
          onChange={(id) => setValue('caseId', id, { shouldValidate: true })}
          load={async (search) =>
            (await casesClient.list(search ? { search } : {})).data.map(
              (c) => ({
                id: c.id,
                label: c.caseNumber,
                sub: c.status,
              }),
            )
          }
        />
        <FormField
          label={t('cases.labels.reason')}
          error={
            errors.reason
              ? t(`form.errors.${errors.reason.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.reason'),
            ...register('reason'),
          }}
        />
        <FormField
          label={t('cases.labels.endsAt')}
          inputProps={{
            type: 'datetime-local',
            ...register('endsAt'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button
          type="button"
          variant="default"
          onClick={() => void handleSubmit(runActivate)()}
          disabled={submitting || authLoading || !user}
        >
          {submitting ? t('cases.submitting') : t('cases.activate')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runList()}
          disabled={submitting}
        >
          {submitting ? t('cases.submitting') : t('cases.result.list')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('cases.result.title')}
        errorTitle={t('cases.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={
          activated
            ? [{ label: t('cases.result.id'), value: activated.id }]
            : undefined
        }
      />
      {grants.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {grants.map((grant) => (
            <div
              key={grant.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <span>
                <code>{grant.subjectMembershipId}</code> —{' '}
                {grant.reason.slice(0, 60)}
              </span>
              <span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void runRevoke(grant.id)}
                  disabled={submitting}
                >
                  {t('cases.revokeGrant')}
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
