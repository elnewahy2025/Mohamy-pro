'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  CasesClient,
  type CaseAssignmentResult,
  type CaseListRow,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';
import { EntityPicker } from '@/components/forms/entity-picker';

const assignSchema = z.object({
  caseId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  membershipId: z.string().min(1, 'invalid').max(100, 'tooLong'),
});
type AssignForm = z.infer<typeof assignSchema>;

export function CaseAssignmentSection({
  selected,
}: {
  selected: CaseListRow | null;
}): React.ReactNode {
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

  useEffect(() => {
    if (selected) {
      assignForm.setValue('caseId', selected.id, { shouldValidate: true });
      // Use setTimeout to ensure the form value is set before reading it in runList
      setTimeout(() => {
        void runList();
      }, 0);
    } else {
      setAssignees([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

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
      assignForm.reset({ caseId: selected?.id ?? '', membershipId: '' });
      setStatus('success');
      void runList(); // Refresh list after assign
    } catch (error) {
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
          : new ApiError(
              error instanceof Error ? error.message : 'Unknown error',
              'INTERNAL',
              [],
              0,
            ),
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
      setAssignees((prev) =>
        prev.filter((a) => a.membershipId !== membershipId),
      );
      setStatus('success');
    } catch (error) {
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <Users size={18} />
        </span>
        <div>
          <h2>{t('cases.sections.assignments')}</h2>
          <p>{t('cases.entity.assignments.description')}</p>
        </div>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void assignForm.handleSubmit(runAssign)();
        }}
      >
        <div className="form-grid">
          {/* Hide Case ID picker since it's redundant when stacked under the selected case, but keep it in the DOM for the form */}
          <div style={{ display: 'none' }}>
            <EntityPicker
              label={t('cases.labels.id')}
              placeholder={t('cases.placeholders.id')}
              required
              error={
                assignForm.formState.errors.caseId
                  ? t(
                      `form.errors.${assignForm.formState.errors.caseId.message}`,
                    )
                  : undefined
              }
              value={assignForm.watch('caseId') ?? ''}
              onChange={(id) =>
                assignForm.setValue('caseId', id, { shouldValidate: true })
              }
              load={async (search) =>
                (await client.list(search ? { search } : {})).data.map((c) => ({
                  id: c.id,
                  label: c.caseNumber,
                  sub: c.status,
                }))
              }
            />
          </div>
          <FormField
            label={t('cases.labels.membershipId')}
            error={
              assignForm.formState.errors.membershipId
                ? t(
                    `form.errors.${assignForm.formState.errors.membershipId.message}`,
                  )
                : undefined
            }
            inputProps={{
              type: 'text',
              autoComplete: 'off',
              placeholder: t('cases.placeholders.membershipId'),
              ...assignForm.register('membershipId'),
            }}
          />
        </div>
        <div className="form-actions form-actions-row">
          <Button
            type="submit"
            variant="default"
            disabled={submitting || authLoading || !user}
          >
            {submitting ? t('cases.submitting') : t('cases.assign')}
          </Button>
        </div>
      </form>

      {submitError && (
        <p className="form-field-error" style={{ marginTop: '1rem' }}>
          {submitError.message}
        </p>
      )}

      {assignees.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {assignees.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span>
                <strong>
                  {entry.membership?.user?.displayName ||
                    entry.membership?.user?.emailNormalized ||
                    'Unknown User'}
                </strong>
                {/* Keep ID around only for debugging/fallback if requested, but we hide it for normal users. We won't show it at all to keep it clean. */}
              </span>
              <span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void runUnassign(entry.membershipId)}
                  disabled={submitting}
                >
                  {t('cases.unassign')}
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        !submitting && (
          <p className="form-field-hint" style={{ marginTop: '1rem' }}>
            No assignees
          </p>
        )
      )}
    </div>
  );
}
