'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  ClientsClient,
  type AddressType,
  type ClientAddressResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const addressSchema = z.object({
  clientId: z.string().min(1, 'invalid').max(64, 'tooLong'),
  id: z.string().max(64).optional(),
  type: z.enum(['MAILING', 'BILLING', 'REGISTERED', 'BRANCH']),
  line1: z.string().min(1, 'invalid').max(300, 'tooLong'),
  line2: z.string().max(300, 'tooLong').optional(),
  city: z.string().min(1, 'invalid').max(100, 'tooLong'),
  region: z.string().max(100, 'tooLong').optional(),
  postalCode: z.string().max(30, 'tooLong').optional(),
  country: z.string().min(1, 'invalid').max(100, 'tooLong'),
  isPrimary: z.string().optional(),
  reason: z.string().max(200, 'tooLong').optional(),
});
type AddressForm = z.infer<typeof addressSchema>;

type ActionKey = 'create' | 'update' | 'remove';

export function AddressSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ClientsClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ClientAddressResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      clientId: '',
      id: '',
      type: 'MAILING',
      line1: '',
      line2: '',
      city: '',
      region: '',
      postalCode: '',
      country: '',
      isPrimary: 'false',
      reason: '',
    },
  });

  async function run(action: ActionKey, form: AddressForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: ClientAddressResult | null = null;
      if (action === 'create') {
        next = await client.createAddress({
          clientId: form.clientId,
          type: form.type as AddressType,
          line1: form.line1,
          line2: form.line2 || null,
          city: form.city,
          region: form.region || null,
          postalCode: form.postalCode || null,
          country: form.country,
          isPrimary: form.isPrimary === 'true',
        });
      } else if (action === 'update') {
        next = await client.updateAddress({
          id: form.id as string,
          clientId: form.clientId,
          line1: form.line1 || undefined,
          line2: form.line2 || undefined,
          city: form.city || undefined,
          region: form.region || undefined,
          postalCode: form.postalCode || undefined,
          country: form.country || undefined,
          isPrimary: form.isPrimary === 'true',
        });
      } else {
        await client.removeAddress({
          id: form.id as string,
          clientId: form.clientId,
          reason: form.reason || undefined,
        });
      }
      setResult(next);
      setStatus('success');
      if (action === 'create') {
        reset({
          clientId: '',
          id: '',
          type: 'MAILING',
          line1: '',
          line2: '',
          city: '',
          region: '',
          postalCode: '',
          country: '',
          isPrimary: 'false',
          reason: '',
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
        <span className="settings-icon" aria-hidden="true"><MapPin size={18} /></span>
        <div>
          <h2>{t('clients.sections.address')}</h2>
          <p>{t('clients.entity.address.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('clients.labels.clientId')}
          error={errors.clientId ? t(`form.errors.${errors.clientId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.clientId'),
            ...register('clientId'),
          }}
        />
        <FormField
          label={t('clients.labels.entityId')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.entityId'),
            ...register('id'),
          }}
        />
        <FormSelect
          label={t('clients.labels.addressType')}
          selectProps={register('type')}
          options={[
            { label: t('common.enums.MAILING'), value: 'MAILING' },
            { label: t('common.enums.BILLING'), value: 'BILLING' },
            { label: t('common.enums.REGISTERED'), value: 'REGISTERED' },
            { label: t('common.enums.BRANCH'), value: 'BRANCH' },
          ]}
        />
        <FormField
          label={t('clients.labels.line1')}
          error={errors.line1 ? t(`form.errors.${errors.line1.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.line1'),
            ...register('line1'),
          }}
        />
        <FormField
          label={t('clients.labels.line2')}
          error={errors.line2 ? t(`form.errors.${errors.line2.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.line2'),
            ...register('line2'),
          }}
        />
        <FormField
          label={t('clients.labels.city')}
          error={errors.city ? t(`form.errors.${errors.city.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.city'),
            ...register('city'),
          }}
        />
        <FormField
          label={t('clients.labels.region')}
          error={errors.region ? t(`form.errors.${errors.region.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.region'),
            ...register('region'),
          }}
        />
        <FormField
          label={t('clients.labels.postalCode')}
          error={errors.postalCode ? t(`form.errors.${errors.postalCode.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.postalCode'),
            ...register('postalCode'),
          }}
        />
        <FormField
          label={t('clients.labels.country')}
          error={errors.country ? t(`form.errors.${errors.country.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.country'),
            ...register('country'),
          }}
        />
        <FormField
          label={t('clients.labels.isPrimary')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.isPrimary'),
            ...register('isPrimary'),
          }}
        />
        <FormField
          label={t('clients.labels.reason')}
          error={errors.reason ? t(`form.errors.${errors.reason.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.reason'),
            ...register('reason'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void trigger('create')} disabled={submitting || authLoading || !user}>
          {submitting ? t('clients.submitting') : t('clients.create')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('update')} disabled={submitting}>
          {submitting ? t('clients.submitting') : t('clients.update')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('remove')} disabled={submitting}>
          {submitting ? t('clients.submitting') : t('clients.remove')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('clients.result.title')}
        errorTitle={t('clients.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={result ? [
          { label: t('clients.result.id'), value: result.id },
          { label: t('clients.result.type'), value: result.type },
          { label: t('clients.result.status'), value: String(result.isPrimary) },
        ] : undefined}
      />
    </form>
  );
}
