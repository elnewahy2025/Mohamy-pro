'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClient, ApiError, type RoleResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const roleSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9.-]*$/, 'invalid').max(80, 'tooLong'),
  name: z.string().min(1, 'invalid').max(120, 'tooLong'),
  description: z.string().max(500, 'tooLong').optional(),
  roleId: z.string().optional(),
  permissionKeys: z.string().optional(),
});
type RoleForm = z.infer<typeof roleSchema>;

function splitKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function RoleCreateSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<RoleResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<RoleForm>({
    resolver: zodResolver(roleSchema),
    defaultValues: { key: '', name: '', description: '', roleId: '', permissionKeys: '' },
  });

  async function fail(error: unknown): Promise<void> {
    setStatus('error');
    setSubmitError(
      error instanceof ApiError
        ? error
        : new ApiError(error instanceof Error ? error.message : 'Unknown error', 'INTERNAL', [], 0),
    );
  }

  async function runCreate(form: RoleForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setResult(
        await client.createRole({
          key: form.key,
          name: form.name,
          description: form.description || undefined,
        }),
      );
      setStatus('success');
    } catch (error) {
      await fail(error);
    } finally {
      setSubmitting(false);
    }
  }

  async function runGrant(): Promise<void> {
    const form = getValues();
    if (!form.roleId) return;
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setResult(await client.grantRolePermissions(form.roleId, { permissionKeys: splitKeys(form.permissionKeys) }));
      setStatus('success');
    } catch (error) {
      await fail(error);
    } finally {
      setSubmitting(false);
    }
  }

  async function runRevoke(): Promise<void> {
    const form = getValues();
    if (!form.roleId) return;
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setResult(await client.revokeRolePermissions(form.roleId, { permissionKeys: splitKeys(form.permissionKeys) }));
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
        <div>
          <h2>{t('identity.roles.sections.create')}</h2>
          <p>{t('identity.roles.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('identity.roles.keyLabel')}
          error={errors.key ? t(`form.errors.${errors.key.message}`) : undefined}
          inputProps={{ type: 'text', autoComplete: 'off', placeholder: t('identity.roles.keyPlaceholder'), ...register('key') }}
        />
        <FormField
          label={t('identity.roles.nameLabel')}
          error={errors.name ? t(`form.errors.${errors.name.message}`) : undefined}
          inputProps={{ type: 'text', autoComplete: 'off', placeholder: t('identity.roles.namePlaceholder'), ...register('name') }}
        />
        <FormField
          label={t('identity.roles.descriptionLabel')}
          error={errors.description ? t(`form.errors.${errors.description.message}`) : undefined}
          inputProps={{ type: 'text', autoComplete: 'off', placeholder: t('identity.roles.descriptionPlaceholder'), ...register('description') }}
        />
        <FormField
          label={t('identity.roles.roleIdLabel')}
          inputProps={{ type: 'text', autoComplete: 'off', placeholder: t('identity.roles.roleIdPlaceholder'), ...register('roleId') }}
        />
        <FormField
          label={t('identity.roles.permissionKeysLabel')}
          inputProps={{ type: 'text', autoComplete: 'off', placeholder: t('identity.roles.permissionKeysPlaceholder'), ...register('permissionKeys') }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void handleSubmit(runCreate)()} disabled={submitting || authLoading || !user}>
          {submitting ? t('identity.roles.submitting') : t('identity.roles.create')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void runGrant()} disabled={submitting}>
          {submitting ? t('identity.roles.submitting') : t('identity.roles.grant')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void runRevoke()} disabled={submitting}>
          {submitting ? t('identity.roles.submitting') : t('identity.roles.revokePermissions')}
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
        fields={result ? [{ label: t('identity.roles.keyLabel'), value: result.key }] : undefined}
      />
    </form>
  );
}
