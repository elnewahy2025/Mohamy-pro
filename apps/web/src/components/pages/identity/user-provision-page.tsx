'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClient, ApiError, type ProvisionUserResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const provisionSchema = z.object({
  email: z.string().trim().max(320).email('invalidEmail'),
  username: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-zA-Z0-9._-]{3,64}$/, 'invalidUsername')
    .or(z.literal(''))
    .optional(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  password: z.string().min(12, 'passwordTooShort').max(128, 'tooLong'),
  roleKeys: z
    .string()
    .trim()
    .min(1, 'atLeastOneRole')
    .refine(
      (value) => {
        const keys = value
          .split(',')
          .map((role) => role.trim())
          .filter((role) => role.length > 0);
        return (
          keys.length >= 1 &&
          keys.length <= 20 &&
          keys.every((key) => key.length <= 80)
        );
      },
      { message: 'invalidRoleKeys' },
    ),
});
type ProvisionForm = z.infer<typeof provisionSchema>;

export function UserProvisionPage(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ProvisionUserResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProvisionForm>({
    resolver: zodResolver(provisionSchema),
    defaultValues: {
      email: '',
      username: '',
      firstName: '',
      lastName: '',
      password: '',
      roleKeys: '',
    },
  });

  async function onSubmit(values: ProvisionForm): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await client.provisionUser({
        email: values.email,
        ...(values.username ? { username: values.username } : {}),
        ...(values.firstName ? { firstName: values.firstName } : {}),
        ...(values.lastName ? { lastName: values.lastName } : {}),
        password: values.password,
        temporaryPassword: true,
        roleKeys: values.roleKeys
          .split(',')
          .map((role) => role.trim())
          .filter((role) => role.length > 0),
      });
      setResult(created);
      setStatus('success');
    } catch (error) {
      setSubmitError(error as ApiError);
      setStatus('error');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <section className="page-section content-page">
        <p>{t('auth.login.checking')}</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="page-section content-page">
        <p>{t('common.signInRequired')}</p>
      </section>
    );
  }

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('identity.eyebrow')}</p>
        <h1>{t('identity.provision.createTitle')}</h1>
        <p>{t('identity.provision.createDescription')}</p>
      </div>

      <form
        className="settings-card"
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
      >
        <FormField
          label={t('identity.provision.emailLabel')}
          inputProps={{
            ...register('email'),
            placeholder: t('identity.provision.emailPlaceholder'),
            required: true,
          }}
          error={
            errors.email ? t('identity.provision.invalidEmail') : undefined
          }
        />
        <FormField
          label={t('identity.provision.usernameLabel')}
          inputProps={{
            ...register('username'),
            placeholder: t('identity.provision.usernamePlaceholder'),
          }}
          error={
            errors.username
              ? t('identity.provision.invalidUsername')
              : undefined
          }
        />
        <FormField
          label={t('identity.provision.firstNameLabel')}
          inputProps={{
            ...register('firstName'),
            placeholder: t('identity.provision.firstNamePlaceholder'),
          }}
        />
        <FormField
          label={t('identity.provision.lastNameLabel')}
          inputProps={{
            ...register('lastName'),
            placeholder: t('identity.provision.lastNamePlaceholder'),
          }}
        />
        <FormField
          label={t('identity.provision.passwordLabel')}
          inputProps={{
            ...register('password'),
            type: 'password',
            placeholder: t('identity.provision.passwordPlaceholder'),
            required: true,
          }}
          error={
            errors.password
              ? t('identity.provision.passwordTooShort')
              : undefined
          }
        />
        <FormField
          label={t('identity.provision.roleKeysLabel')}
          inputProps={{
            ...register('roleKeys'),
            placeholder: t('identity.provision.roleKeysPlaceholder'),
            required: true,
          }}
          error={
            errors.roleKeys
              ? t(
                  `identity.provision.${errors.roleKeys.message === 'invalidRoleKeys' ? 'invalidRoleKeys' : 'atLeastOneRole'}`,
                )
              : undefined
          }
        />
        <div className="form-actions form-actions-row mt-6">
          <Button type="submit" variant="default" disabled={submitting}>
            <UserPlus aria-hidden="true" size={16} />
            {submitting
              ? t('identity.provision.submitting')
              : t('identity.provision.submit')}
          </Button>
        </div>
      </form>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status === 'success' ? 'success' : 'error'}
          successLabel={t('identity.provision.successTitle')}
          errorTitle={t('identity.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={
            result
              ? [
                  {
                    label: t('identity.provision.invitation'),
                    value: result.invitationId,
                  },
                  {
                    label: t('identity.provision.expires'),
                    value: result.expiresAt.slice(0, 10),
                  },
                ]
              : []
          }
        />
      )}
    </section>
  );
}
