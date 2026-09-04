'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Contact } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  ClientsClient,
  type ClientContactResult,
  type ContactType,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const contactSchema = z.object({
  clientId: z.string().min(1, 'invalid').max(64, 'tooLong'),
  id: z.string().max(64).optional(),
  type: z.enum(['PHONE', 'EMAIL', 'FAX', 'WEBSITE', 'MOBILE']),
  value: z.string().min(1, 'invalid').max(300, 'tooLong'),
  label: z.string().max(100, 'tooLong').optional(),
  isPrimary: z.string().optional(),
  reason: z.string().max(200, 'tooLong').optional(),
});
type ContactForm = z.infer<typeof contactSchema>;

type ActionKey = 'create' | 'update' | 'remove';

export function ContactSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ClientsClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ClientContactResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { clientId: '', id: '', type: 'EMAIL', value: '', label: '', isPrimary: 'false', reason: '' },
  });

  async function run(action: ActionKey, form: ContactForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: ClientContactResult | null = null;
      if (action === 'create') {
        next = await client.createContact({
          clientId: form.clientId,
          type: form.type as ContactType,
          value: form.value,
          label: form.label || null,
          isPrimary: form.isPrimary === 'true',
        });
      } else if (action === 'update') {
        next = await client.updateContact({
          id: form.id as string,
          clientId: form.clientId,
          value: form.value || undefined,
          label: form.label || undefined,
          isPrimary: form.isPrimary === 'true',
        });
      } else {
        await client.removeContact({
          id: form.id as string,
          clientId: form.clientId,
          reason: form.reason || undefined,
        });
      }
      setResult(next);
      setStatus('success');
      if (action === 'create') {
        reset({ clientId: '', id: '', type: 'EMAIL', value: '', label: '', isPrimary: 'false', reason: '' });
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
        <span className="settings-icon" aria-hidden="true"><Contact size={18} /></span>
        <div>
          <h2>{t('clients.sections.contact')}</h2>
          <p>{t('clients.entity.contact.description')}</p>
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
        <FormField
          label={t('clients.labels.contactType')}
          error={errors.type ? t(`form.errors.${errors.type.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.contactType'),
            ...register('type'),
          }}
        />
        <FormField
          label={t('clients.labels.contactValue')}
          error={errors.value ? t(`form.errors.${errors.value.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.contactValue'),
            ...register('value'),
          }}
        />
        <FormField
          label={t('clients.labels.contactLabel')}
          error={errors.label ? t(`form.errors.${errors.label.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.contactLabel'),
            ...register('label'),
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
