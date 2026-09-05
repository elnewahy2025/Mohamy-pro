'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  CasesClient,
  type CaseAssignmentResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const assignSchema = z.object({
  caseId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  membershipId: z.string().min(1, 'invalid').max(100, 'tooLong'),
});
type AssignForm = z.infer<typeof assignSchema>;

export function CaseAssignmentSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new CasesClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [assigned, setAssigned] = useState<CaseAssignmentResult | null>(null);
  const [assignees, setAssignees] = useState<CaseAssignmentResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const assignForm = useForm<AssignForm>({
    resolver: zodResolver(assignSchema),
    defaultValues: { caseId: '', membershipId: '' },
  });

  async function runAssign(form: AssignForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.assignMember({
        caseId: form.caseId,
        membershipId: form.membershipId,
      });
      setAssigned(result);
      assignForm.reset({ caseId: '', membershipId: '' });
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

  async function runList(): Promise<void> {
    const caseId = assignForm.getValues().caseId;
    if (!caseId) return;
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setAssignees(await client.listAssignees(caseId));
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

  async function runUnassign(membershipId: string): Promise<void> {
    const caseId = assignForm.getValues().caseId;
    if (!caseId || !membershipId) return;
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      await client.unassignMember({ caseId, membershipId });
      setAssignees((prev) => prev.filter((a) => a.membershipId !== membershipId));
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
        <span className="settings-icon" aria-hidden="true"><Users size={18} /></span>
        <div>
          <h2>{t('cases.sections.assignments')}</h2>
          <p>{t('cases.entity.assignments.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('cases.labels.id')}
          error={assignForm.formState.errors.caseId ? t(`form.errors.${assignForm.formState.errors.caseId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.id'),
            ...assignForm.register('caseId'),
          }}
        />
        <FormField
          label={t('cases.labels.membershipId')}
          error={assignForm.formState.errors.membershipId ? t(`form.errors.${assignForm.formState.errors.membershipId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.membershipId'),
            ...assignForm.register('membershipId'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void assignForm.handleSubmit(runAssign)()} disabled={submitting || authLoading || !user}>
          {submitting ? t('cases.submitting') : t('cases.assign')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void runList()} disabled={submitting}>
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
        fields={assigned ? [
          { label: t('cases.result.id'), value: assigned.id },
        ] : undefined}
      />
      {assignees.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {assignees.map((entry) => (
            <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span><code>{entry.membershipId}</code></span>
              <span>
                <Button type="button" variant="outline" onClick={() => void runUnassign(entry.membershipId)} disabled={submitting}>
                  {t('cases.unassign')}
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
