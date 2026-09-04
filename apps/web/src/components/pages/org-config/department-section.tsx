'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  OrgConfigClient,
  type DepartmentResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const departmentSchema = z.object({
  id: z.string().max(64).optional(),
  branchId: z.string().min(1, 'invalidUuid'),
  slug: z.string().min(1, 'invalid').max(100, 'tooLong'),
  name: z.string().min(1, 'invalid').max(200, 'tooLong'),
  reason: z.string().max(200, 'tooLong').optional(),
});
type DepartmentForm = z.infer<typeof departmentSchema>;

type ActionKey = 'create' | 'update' | 'archive';

export function DepartmentSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new OrgConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<DepartmentResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DepartmentForm>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { id: '', branchId: '', slug: '', name: '', reason: '' },
  });

  async function run(action: ActionKey, form: DepartmentForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: DepartmentResult;
      if (action === 'create') {
        next = await client.createDepartment({
          branchId: form.branchId,
          slug: form.slug,
          name: form.name,
        });
      } else if (action === 'update') {
        next = await client.updateDepartment({
          id: form.id as string,
          slug: form.slug || undefined,
          name: form.name || undefined,
        });
      } else {
        next = await client.archiveDepartment({
          id: form.id as string,
          reason: form.reason || undefined,
        });
      }
      setResult(next);
      setStatus('success');
      if (action === 'create') reset({ id: '', branchId: '', slug: '', name: '', reason: '' });
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
        <span className="settings-icon" aria-hidden="true"><Layers size={18} /></span>
        <div>
          <h2>{t('orgConfig.sections.department')}</h2>
          <p>{t('orgConfig.entity.department.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('orgConfig.labels.entityId')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.entityId'),
            ...register('id'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.branchId')}
          error={errors.branchId ? t(`form.errors.${errors.branchId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.branchId'),
            ...register('branchId'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.slug')}
          error={errors.slug ? t(`form.errors.${errors.slug.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.slug'),
            ...register('slug'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.name')}
          error={errors.name ? t(`form.errors.${errors.name.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.name'),
            ...register('name'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.reason')}
          error={errors.reason ? t(`form.errors.${errors.reason.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.reason'),
            ...register('reason'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void trigger('create')} disabled={submitting || authLoading || !user}>
          {submitting ? t('orgConfig.submitting') : t('orgConfig.create')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('update')} disabled={submitting}>
          {submitting ? t('orgConfig.submitting') : t('orgConfig.update')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('archive')} disabled={submitting}>
          {submitting ? t('orgConfig.submitting') : t('orgConfig.archive')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('orgConfig.result.title')}
        errorTitle={t('orgConfig.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={result ? [
          { label: t('orgConfig.result.id'), value: result.id },
          { label: t('orgConfig.result.status'), value: result.status },
        ] : undefined}
      />
    </form>
  );
}
