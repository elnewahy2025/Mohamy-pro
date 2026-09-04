'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  ClientsClient,
  type ClientResult,
  type ClientType,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const clientSchema = z.object({
  id: z.string().optional(),
  clientType: z.enum(['INDIVIDUAL', 'ORGANIZATION']),
  name: z.string().min(1, 'invalid').max(200, 'tooLong'),
  legalName: z.string().max(200, 'tooLong').optional(),
  source: z.string().max(100, 'tooLong').optional(),
  notes: z.string().max(2000, 'tooLong').optional(),
  reason: z.string().max(200, 'tooLong').optional(),
});
type ClientForm = z.infer<typeof clientSchema>;

type ActionKey = 'create' | 'update' | 'archive';

export function ClientSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ClientsClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ClientResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      id: '',
      clientType: 'INDIVIDUAL',
      name: '',
      legalName: '',
      source: '',
      notes: '',
      reason: '',
    },
  });

  async function run(action: ActionKey, form: ClientForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: ClientResult;
      if (action === 'create') {
        next = await client.createClient({
          clientType: form.clientType as ClientType,
          name: form.name,
          legalName: form.legalName || null,
          source: form.source || null,
          notes: form.notes || null,
        });
      } else if (action === 'update') {
        next = await client.updateClient({
          id: form.id as string,
          name: form.name || undefined,
          legalName: form.legalName || undefined,
          source: form.source || undefined,
          notes: form.notes || undefined,
        });
      } else {
        next = await client.archiveClient({
          id: form.id as string,
          reason: form.reason || undefined,
        });
      }
      setResult(next);
      setStatus('success');
      if (action === 'create') {
        reset({
          id: '',
          clientType: 'INDIVIDUAL',
          name: '',
          legalName: '',
          source: '',
          notes: '',
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
        <span className="settings-icon" aria-hidden="true"><Users size={18} /></span>
        <div>
          <h2>{t('clients.sections.client')}</h2>
          <p>{t('clients.entity.client.description')}</p>
        </div>
      </div>
      <div className="form-grid">
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
          label={t('clients.labels.clientType')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.clientType'),
            ...register('clientType'),
          }}
        />
        <FormField
          label={t('clients.labels.name')}
          error={errors.name ? t(`form.errors.${errors.name.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.name'),
            ...register('name'),
          }}
        />
        <FormField
          label={t('clients.labels.legalName')}
          error={errors.legalName ? t(`form.errors.${errors.legalName.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.legalName'),
            ...register('legalName'),
          }}
        />
        <FormField
          label={t('clients.labels.source')}
          error={errors.source ? t(`form.errors.${errors.source.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.source'),
            ...register('source'),
          }}
        />
        <FormField
          label={t('clients.labels.notes')}
          error={errors.notes ? t(`form.errors.${errors.notes.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.notes'),
            ...register('notes'),
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
        <Button type="button" variant="outline" onClick={() => void trigger('archive')} disabled={submitting}>
          {submitting ? t('clients.submitting') : t('clients.archive')}
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
          { label: t('clients.result.name'), value: result.displayName },
          { label: t('clients.result.status'), value: result.status },
        ] : undefined}
      />
    </form>
  );
}
