'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as LinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  CasesClient,
  type CasePartyResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const addSchema = z.object({
  caseId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  partyId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  roleId: z.string().min(1, 'invalid').max(100, 'tooLong'),
});
type AddForm = z.infer<typeof addSchema>;

const removeSchema = z.object({
  caseId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  partyId: z.string().min(1, 'invalid').max(100, 'tooLong'),
});
type RemoveForm = z.infer<typeof removeSchema>;

export function CasePartySection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new CasesClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [added, setAdded] = useState<CasePartyResult | null>(null);
  const [removed, setRemoved] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const addForm = useForm<AddForm>({
    resolver: zodResolver(addSchema),
    defaultValues: { caseId: '', partyId: '', roleId: '' },
  });
  const removeForm = useForm<RemoveForm>({
    resolver: zodResolver(removeSchema),
    defaultValues: { caseId: '', partyId: '' },
  });

  async function runAdd(form: AddForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.addParty({
        caseId: form.caseId,
        partyId: form.partyId,
        roleId: form.roleId,
      });
      setAdded(result);
      setRemoved(false);
      addForm.reset({ caseId: '', partyId: '', roleId: '' });
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

  async function runRemove(form: RemoveForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      await client.removeParty({ caseId: form.caseId, partyId: form.partyId });
      setAdded(null);
      setRemoved(true);
      removeForm.reset({ caseId: '', partyId: '' });
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
        <span className="settings-icon" aria-hidden="true"><LinkIcon size={18} /></span>
        <div>
          <h2>{t('cases.sections.party')}</h2>
          <p>{t('cases.entity.party.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('cases.labels.id')}
          error={addForm.formState.errors.caseId ? t(`form.errors.${addForm.formState.errors.caseId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.id'),
            ...addForm.register('caseId'),
          }}
        />
        <FormField
          label={t('cases.labels.partyId')}
          error={addForm.formState.errors.partyId ? t(`form.errors.${addForm.formState.errors.partyId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.partyId'),
            ...addForm.register('partyId'),
          }}
        />
        <FormField
          label={t('cases.labels.roleId')}
          error={addForm.formState.errors.roleId ? t(`form.errors.${addForm.formState.errors.roleId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.roleId'),
            ...addForm.register('roleId'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void addForm.handleSubmit(runAdd)()} disabled={submitting || authLoading || !user}>
          {submitting ? t('cases.submitting') : t('cases.addParty')}
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
        fields={added ? [
          { label: t('cases.result.id'), value: added.id },
          { label: t('cases.labels.partyId'), value: added.partyId },
          { label: t('cases.labels.roleId'), value: added.roleId },
        ] : removed ? [
          { label: t('cases.result.title'), value: t('cases.removeParty') },
        ] : undefined}
      />
      <div className="form-grid" style={{ marginTop: '1rem' }}>
        <FormField
          label={t('cases.labels.id')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.id'),
            ...removeForm.register('caseId'),
          }}
        />
        <FormField
          label={t('cases.labels.partyId')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.partyId'),
            ...removeForm.register('partyId'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="outline" onClick={() => void removeForm.handleSubmit(runRemove)()} disabled={submitting || authLoading || !user}>
          {submitting ? t('cases.submitting') : t('cases.removeParty')}
        </Button>
      </div>
    </form>
  );
}
