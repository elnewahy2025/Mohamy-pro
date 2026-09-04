'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileCode2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  WorkflowsClient,
  type WorkflowResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const workflowSchema = z.object({
  name: z.string().min(1, 'invalid').max(255, 'tooLong'),
  caseType: z.string().max(255, 'tooLong').optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});
type WorkflowForm = z.infer<typeof workflowSchema>;

export function WorkflowSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new WorkflowsClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<WorkflowResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WorkflowForm>({
    resolver: zodResolver(workflowSchema),
    defaultValues: { name: '', caseType: '', status: 'ACTIVE' },
  });

  async function runCreate(form: WorkflowForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.createWorkflow({
        name: form.name,
        caseType: form.caseType || undefined,
        status: form.status || 'ACTIVE',
      });
      setCreated(result);
      setStatus('success');
      reset();
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
        <span className="settings-icon" aria-hidden="true"><FileCode2 size={18} /></span>
        <div>
          <h2>{t('workflows.sections.workflow')}</h2>
          <p>{t('workflows.description')}</p>
        </div>
      </div>
      
      <div className="form-grid">
        <FormField
          label={t('workflows.labels.name')}
          error={errors.name ? t(`form.errors.${errors.name.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('workflows.placeholders.name'),
            ...register('name'),
          }}
        />
        <FormSelect
          label={t('workflows.labels.caseType')}
          error={errors.caseType ? t(`form.errors.${errors.caseType.message}`) : undefined}
          options={[
            { label: t('common.enums.CIVIL'), value: 'CIVIL' },
            { label: t('common.enums.CRIMINAL'), value: 'CRIMINAL' },
            { label: t('common.enums.COMMERCIAL'), value: 'COMMERCIAL' }
          ]}
          selectProps={{
            ...register('caseType'),
          }}
        />
        <FormSelect
          label={t('workflows.result.status')}
          error={errors.status ? t(`form.errors.${errors.status.message}`) : undefined}
          options={[
            { label: t('common.enums.ACTIVE'), value: 'ACTIVE' },
            { label: t('common.enums.ARCHIVED'), value: 'ARCHIVED' }
          ]}
          selectProps={{
            ...register('status'),
          }}
        />
      </div>

      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void handleSubmit(runCreate)()} disabled={submitting || authLoading || !user}>
          {submitting ? t('workflows.submitting') : t('workflows.create')}
        </Button>
      </div>

      <OperationResult
        status={status}
        successLabel={t('workflows.result.title')}
        errorTitle={t('workflows.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        fields={created ? [
          { label: t('workflows.result.id'), value: created.id },
          { label: t('workflows.result.name'), value: created.name },
        ] : undefined}
      />
    </form>
  );
}
