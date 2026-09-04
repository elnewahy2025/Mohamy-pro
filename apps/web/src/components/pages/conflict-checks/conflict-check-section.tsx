'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  ConflictChecksClient,
  type ConflictCheckResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const conflictCheckSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().max(200, 'tooLong').optional(),
  reason: z.string().max(2000, 'tooLong').optional(),
  parties: z
    .array(
      z.object({
        kind: z.enum(['PARTY', 'RELATED_ENTITY']),
        name: z.string().min(1, 'invalid').max(300, 'tooLong'),
        email: z.string().max(300, 'tooLong').optional(),
      }),
    )
    .min(1, 'partyRequired'),
});
type ConflictCheckForm = z.infer<typeof conflictCheckSchema>;

type ActionKey = 'request' | 'startReview' | 'decideAllow' | 'decideBlock';

export function ConflictCheckSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ConflictChecksClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ConflictCheckResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<ConflictCheckForm>({
    resolver: zodResolver(conflictCheckSchema),
    defaultValues: {
      id: '',
      clientId: '',
      reason: '',
      parties: [{ kind: 'PARTY', name: '', email: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'parties',
  });

  async function run(action: ActionKey, form: ConflictCheckForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: ConflictCheckResult;
      if (action === 'request') {
        next = await client.request({
          clientId: form.clientId || null,
          parties: form.parties.map((p) => ({
            kind: p.kind,
            name: p.name,
            email: p.email || null,
          })),
        });
      } else if (action === 'startReview') {
        next = await client.startReview({ id: form.id as string });
      } else {
        const decision: 'ALLOW' | 'BLOCK' = action === 'decideAllow' ? 'ALLOW' : 'BLOCK';
        next = await client.decide({
          id: form.id as string,
          decision,
          reason: form.reason || undefined,
        });
      }
      setResult(next);
      setStatus('success');
      if (action === 'request') {
        reset({
          id: '',
          clientId: '',
          reason: '',
          parties: [{ kind: 'PARTY', name: '', email: '' }],
        });
      }
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

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true"><ShieldAlert size={18} /></span>
        <div>
          <h2>{t('conflictChecks.sections.check')}</h2>
          <p>{t('conflictChecks.entity.check.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('conflictChecks.labels.id')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('conflictChecks.placeholders.id'),
            ...register('id'),
          }}
        />
        <FormField
          label={t('conflictChecks.labels.clientId')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('conflictChecks.placeholders.clientId'),
            ...register('clientId'),
          }}
        />
        <FormField
          label={t('conflictChecks.labels.reason')}
          error={errors.reason ? t(`form.errors.${errors.reason.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('conflictChecks.placeholders.reason'),
            ...register('reason'),
          }}
        />
      </div>
      {fields.map((field, index) => (
        <div key={field.id} className="form-grid" style={{ marginTop: '1rem' }}>
          <FormSelect
            label={`${t('conflictChecks.labels.partyKind')} ${index + 1}`}
            selectProps={register(`parties.${index}.kind` as const)}
            options={[
              { label: t('common.enums.PARTY'), value: 'PARTY' },
              { label: t('common.enums.RELATED_ENTITY'), value: 'RELATED_ENTITY' },
            ]}
          />
          <FormField
            label={`${t('conflictChecks.labels.partyName')} ${index + 1}`}
            error={errors.parties?.[index]?.name ? t(`form.errors.${errors.parties[index]?.name?.message}`) : undefined}
            inputProps={{
              type: 'text',
              autoComplete: 'off',
              placeholder: t('conflictChecks.placeholders.partyName'),
              ...register(`parties.${index}.name`),
            }}
          />
          <FormField
            label={`${t('conflictChecks.labels.partyEmail')} ${index + 1}`}
            error={errors.parties?.[index]?.email ? t(`form.errors.${errors.parties[index]?.email?.message}`) : undefined}
            inputProps={{
              type: 'text',
              autoComplete: 'off',
              placeholder: t('conflictChecks.placeholders.partyEmail'),
              ...register(`parties.${index}.email`),
            }}
          />
          {fields.length > 1 ? (
            <Button type="button" variant="ghost" onClick={() => remove(index)} disabled={submitting}>
              {t('conflictChecks.remove')}
            </Button>
          ) : null}
        </div>
      ))}
      {errors.parties?.message ? (
        <p className="form-field-error" role="alert">
          {t(`form.errors.${errors.parties.message}`)}
        </p>
      ) : null}
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void trigger('request')} disabled={submitting || authLoading || !user}>
          {submitting ? t('conflictChecks.submitting') : t('conflictChecks.request')}
        </Button>
        <Button type="button" variant="outline" onClick={() => append({ kind: 'PARTY', name: '', email: '' })} disabled={submitting}>
          {t('conflictChecks.addParty')}
        </Button>
      </div>
      <div className="form-actions form-actions-row" style={{ marginTop: '0.5rem' }}>
        <Button type="button" variant="outline" onClick={() => void trigger('startReview')} disabled={submitting}>
          {submitting ? t('conflictChecks.submitting') : t('conflictChecks.startReview')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('decideAllow')} disabled={submitting}>
          {submitting ? t('conflictChecks.submitting') : t('conflictChecks.decideAllow')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('decideBlock')} disabled={submitting}>
          {submitting ? t('conflictChecks.submitting') : t('conflictChecks.decideBlock')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('conflictChecks.result.title')}
        errorTitle={t('conflictChecks.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={result ? [
          { label: t('conflictChecks.result.id'), value: result.id },
          { label: t('conflictChecks.result.status'), value: result.status },
          { label: t('conflictChecks.result.decision'), value: result.decision },
          { label: t('conflictChecks.result.parties'), value: String(result.parties.length) },
        ] : undefined}
      />
    </form>
  );
}
