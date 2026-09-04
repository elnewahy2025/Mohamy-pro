'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Briefcase } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  CasesClient,
  type CasePriority,
  type CaseResult,
  type CaseStatus,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const caseSchema = z.object({
  id: z.string().optional(),
  caseNumber: z.string().min(1, 'invalid').max(255, 'tooLong'),
  internalNumber: z.string().max(255, 'tooLong').optional(),
  clientId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  practiceArea: z.string().max(255, 'tooLong').optional(),
  caseType: z.string().max(255, 'tooLong').optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  openDate: z.string().optional(),
  closeDate: z.string().optional(),
  partyIds: z.string().optional(),
});
type CaseForm = z.infer<typeof caseSchema>;

type ActionKey = 'create' | 'update';

export function CaseSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new CasesClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<CaseResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CaseForm>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      id: '',
      caseNumber: '',
      internalNumber: '',
      clientId: '',
      practiceArea: '',
      caseType: '',
      status: '',
      priority: '',
      openDate: '',
      closeDate: '',
      partyIds: '',
    },
  });

  function parsePartyIds(raw: string): string[] {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  async function run(action: ActionKey, form: CaseForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: CaseResult;
      if (action === 'create') {
        next = await client.create({
          caseNumber: form.caseNumber,
          internalNumber: form.internalNumber || null,
          clientId: form.clientId,
          practiceArea: form.practiceArea || null,
          caseType: form.caseType || null,
          status: (form.status || undefined) as CaseStatus | undefined,
          priority: (form.priority || undefined) as CasePriority | undefined,
          openDate: form.openDate || null,
          closeDate: form.closeDate || null,
          partyIds: parsePartyIds(form.partyIds ?? ''),
        });
        reset({
          id: '',
          caseNumber: '',
          internalNumber: '',
          clientId: '',
          practiceArea: '',
          caseType: '',
          status: '',
          priority: '',
          openDate: '',
          closeDate: '',
          partyIds: '',
        });
      } else {
        next = await client.update({
          id: form.id as string,
          caseNumber: form.caseNumber || undefined,
          internalNumber: form.internalNumber || undefined,
          practiceArea: form.practiceArea || undefined,
          caseType: form.caseType || undefined,
          status: (form.status || undefined) as CaseStatus | undefined,
          priority: (form.priority || undefined) as CasePriority | undefined,
          openDate: form.openDate || undefined,
          closeDate: form.closeDate || undefined,
        });
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

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true"><Briefcase size={18} /></span>
        <div>
          <h2>{t('cases.sections.case')}</h2>
          <p>{t('cases.entity.case.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('cases.labels.id')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.id'),
            ...register('id'),
          }}
        />
        <FormField
          label={t('cases.labels.caseNumber')}
          error={errors.caseNumber ? t(`form.errors.${errors.caseNumber.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.caseNumber'),
            ...register('caseNumber'),
          }}
        />
        <FormField
          label={t('cases.labels.internalNumber')}
          error={errors.internalNumber ? t(`form.errors.${errors.internalNumber.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.internalNumber'),
            ...register('internalNumber'),
          }}
        />
        <FormField
          label={t('cases.labels.clientId')}
          error={errors.clientId ? t(`form.errors.${errors.clientId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.clientId'),
            ...register('clientId'),
          }}
        />
        <FormField
          label={t('cases.labels.practiceArea')}
          error={errors.practiceArea ? t(`form.errors.${errors.practiceArea.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.practiceArea'),
            ...register('practiceArea'),
          }}
        />
        <FormField
          label={t('cases.labels.caseType')}
          error={errors.caseType ? t(`form.errors.${errors.caseType.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.caseType'),
            ...register('caseType'),
          }}
        />
        <FormField
          label={t('cases.labels.status')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.status'),
            ...register('status'),
          }}
        />
        <FormField
          label={t('cases.labels.priority')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.priority'),
            ...register('priority'),
          }}
        />
        <FormField
          label={t('cases.labels.openDate')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.openDate'),
            ...register('openDate'),
          }}
        />
        <FormField
          label={t('cases.labels.closeDate')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.closeDate'),
            ...register('closeDate'),
          }}
        />
        <FormField
          label={t('cases.labels.partyIds')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.partyIds'),
            ...register('partyIds'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void trigger('create')} disabled={submitting || authLoading || !user}>
          {submitting ? t('cases.submitting') : t('cases.create')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('update')} disabled={submitting}>
          {submitting ? t('cases.submitting') : t('cases.update')}
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
        fields={result ? [
          { label: t('cases.result.id'), value: result.id },
          { label: t('cases.result.caseNumber'), value: result.caseNumber },
          { label: t('cases.result.status'), value: result.status },
        ] : undefined}
      />
    </form>
  );
}
