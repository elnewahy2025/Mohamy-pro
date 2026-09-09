'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Contact } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  ClientsClient,
  type ClientResult,
  type ClientContactResult,
  type ContactType,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';
import { EntityPicker } from '@/components/forms/entity-picker';

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

export function ContactSection({
  selected,
}: {
  selected: ClientResult | null;
}): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ClientsClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ClientContactResult | null>(null);
  const [items, setItems] = useState<ClientContactResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      clientId: '',
      id: '',
      type: 'EMAIL',
      value: '',
      label: '',
      isPrimary: 'false',
      reason: '',
    },
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
      if (form.clientId) void runList(form.clientId);
      if (action === 'create') {
        const keepClientId = form.clientId;
        reset({
          clientId: keepClientId,
          id: '',
          type: 'EMAIL',
          value: '',
          label: '',
          isPrimary: 'false',
          reason: '',
        });
        if (keepClientId) void runList(keepClientId);
      }
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

  async function trigger(action: ActionKey): Promise<void> {
    await handleSubmit((form) => run(action, form))();
  }

  async function runList(clientId: string): Promise<void> {
    try {
      setItems(await client.listContacts(clientId));
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    if (selected) {
      setValue('clientId', selected.id, { shouldValidate: true });
      void runList(selected.id);
    } else {
      setItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <Contact size={18} />
        </span>
        <div>
          <h2>{t('clients.sections.contact')}</h2>
          <p>{t('clients.entity.contact.description')}</p>
        </div>
      </div>
      {selected ? (
        <p className="form-field-hint">{selected.displayName}</p>
      ) : null}
      {selected ? (
        <p className="form-field-hint">{selected.displayName}</p>
      ) : null}
      <div className="form-grid">
        <EntityPicker
          label={t('clients.labels.clientId')}
          placeholder={t('clients.placeholders.clientId')}
          required
          error={
            errors.clientId
              ? t(`form.errors.${errors.clientId.message}`)
              : undefined
          }
          value={watch('clientId') ?? ''}
          onChange={(id) => setValue('clientId', id, { shouldValidate: true })}
          load={async (search) =>
            (await client.listClients(search ? { search } : {})).data.map(
              (c) => ({
                id: c.id,
                label: c.displayName,
                sub: c.clientType,
              }),
            )
          }
        />
        <FormSelect
          label={t('clients.labels.contactType')}
          selectProps={register('type')}
          options={[
            { label: t('common.enums.EMAIL'), value: 'EMAIL' },
            { label: t('common.enums.PHONE'), value: 'PHONE' },
            { label: t('common.enums.FAX'), value: 'FAX' },
            { label: t('common.enums.WEBSITE'), value: 'WEBSITE' },
            { label: t('common.enums.MOBILE'), value: 'MOBILE' },
          ]}
        />
        <FormField
          label={t('clients.labels.contactValue')}
          error={
            errors.value ? t(`form.errors.${errors.value.message}`) : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.contactValue'),
            ...register('value'),
          }}
        />
        <FormField
          label={t('clients.labels.contactLabel')}
          error={
            errors.label ? t(`form.errors.${errors.label.message}`) : undefined
          }
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
          error={
            errors.reason
              ? t(`form.errors.${errors.reason.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.reason'),
            ...register('reason'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button
          type="button"
          variant="default"
          onClick={() => void trigger(result ? 'update' : 'create')}
          disabled={submitting || authLoading || !user}
        >
          {submitting
            ? t('clients.submitting')
            : result
              ? t('clients.save')
              : t('clients.create')}
        </Button>
        {result ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!window.confirm(t('clients.result.archiveConfirm'))) return;
              void trigger('remove');
            }}
            disabled={submitting}
          >
            {submitting ? t('clients.submitting') : t('clients.remove')}
          </Button>
        ) : null}
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
        fields={
          result
            ? [
                { label: t('clients.result.id'), value: result.id },
                { label: t('clients.result.type'), value: result.type },
                {
                  label: t('clients.result.status'),
                  value: String(result.isPrimary),
                },
              ]
            : undefined
        }
      />
      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setValue('id', item.id);
                  setValue('type', item.type);
                  setValue('value', item.value);
                  setValue('label', item.label ?? '');
                  setValue('isPrimary', item.isPrimary ? 'true' : 'false');
                  setResult(item);
                }}
              >
                {item.type} — {item.value.slice(0, 40)}
                {item.isPrimary ? ' ★' : ''}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setValue('id', item.id);
                  setValue('type', item.type);
                  setValue('value', item.value);
                  setValue('label', item.label ?? '');
                  setValue('isPrimary', item.isPrimary ? 'true' : 'false');
                  setResult(item);
                }}
              >
                {item.type} — {item.value.slice(0, 40)}
                {item.isPrimary ? ' ★' : ''}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
