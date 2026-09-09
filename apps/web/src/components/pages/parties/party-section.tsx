'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  ClientsClient,
  PartyClient,
  type PartyResult,
  type PartyType,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';
import { EntityPicker } from '@/components/forms/entity-picker';

const partySchema = z.object({
  id: z.string().optional(),
  partyType: z.enum(['PERSON', 'ORGANIZATION']),
  name: z.string().max(255, 'tooLong').optional(),
  legalName: z.string().max(255, 'tooLong').optional(),
  displayName: z.string().min(1, 'invalid').max(255, 'tooLong'),
  clientId: z.string().max(100, 'tooLong').optional(),
  notes: z.string().max(2000, 'tooLong').optional(),
  reason: z.string().max(200, 'tooLong').optional(),
});
type PartyForm = z.infer<typeof partySchema>;

type ActionKey = 'create' | 'update' | 'archive';

export function PartySection({
  selected,
}: {
  selected: PartyResult | null;
}): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new PartyClient());
  const [clientsClient] = useState(() => new ClientsClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<PartyResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PartyForm>({
    resolver: zodResolver(partySchema),
    defaultValues: {
      id: '',
      partyType: 'PERSON',
      name: '',
      legalName: '',
      displayName: '',
      clientId: '',
      notes: '',
      reason: '',
    },
  });

  async function run(action: ActionKey, form: PartyForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: PartyResult;
      if (action === 'create') {
        next = await client.create({
          partyType: form.partyType as PartyType,
          name: form.name || null,
          legalName: form.legalName || null,
          displayName: form.displayName,
          clientId: form.clientId || null,
          notes: form.notes || null,
        });
      } else if (action === 'update') {
        next = await client.update({
          id: form.id as string,
          name: form.name || undefined,
          legalName: form.legalName || undefined,
          displayName: form.displayName || undefined,
          notes: form.notes || undefined,
        });
      } else {
        next = await client.archive({
          id: form.id as string,
          reason: form.reason || undefined,
        });
      }
      setResult(next);
      setStatus('success');
      if (action === 'create') {
        reset({
          id: '',
          partyType: 'PERSON',
          name: '',
          legalName: '',
          displayName: '',
          clientId: '',
          notes: '',
          reason: '',
        });
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

  function fillForm(item: PartyResult): void {
    setResult(item);
    setValue('id', item.id);
    setValue('partyType', item.partyType);
    setValue('name', item.name ?? '');
    setValue('legalName', item.legalName ?? '');
    setValue('displayName', item.displayName);
    setValue('clientId', item.clientId ?? '');
    setValue('notes', item.notes ?? '');
  }

  useEffect(() => {
    if (selected) fillForm(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <Users size={18} />
        </span>
        <div>
          <h2>{t('parties.sections.party')}</h2>
          <p>{t('parties.entity.party.description')}</p>
        </div>
      </div>
      {result ? (
        <p className="form-field-hint">
          {result.displayName} [{result.status}]
        </p>
      ) : null}
      <div className="form-grid">
        <FormSelect
          label={t('parties.labels.partyType')}
          selectProps={register('partyType')}
          options={[
            { label: t('common.enums.INDIVIDUAL'), value: 'PERSON' },
            { label: t('common.enums.ORGANIZATION'), value: 'ORGANIZATION' },
          ]}
        />
        <FormField
          label={t('parties.labels.name')}
          error={
            errors.name ? t(`form.errors.${errors.name.message}`) : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.name'),
            ...register('name'),
          }}
        />
        <FormField
          label={t('parties.labels.legalName')}
          error={
            errors.legalName
              ? t(`form.errors.${errors.legalName.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.legalName'),
            ...register('legalName'),
          }}
        />
        <FormField
          label={t('parties.labels.displayName')}
          error={
            errors.displayName
              ? t(`form.errors.${errors.displayName.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.displayName'),
            ...register('displayName'),
          }}
        />
        <EntityPicker
          label={t('parties.labels.clientId')}
          placeholder={t('parties.placeholders.clientId')}
          error={
            errors.clientId
              ? t(`form.errors.${errors.clientId.message}`)
              : undefined
          }
          value={watch('clientId') ?? ''}
          onChange={(id) => setValue('clientId', id, { shouldValidate: true })}
          load={async (search) =>
            (
              await clientsClient.listClients(search ? { search } : {})
            ).data.map((c) => ({
              id: c.id,
              label: c.displayName,
              sub: c.clientType,
            }))
          }
        />
        <FormField
          label={t('parties.labels.notes')}
          error={
            errors.notes ? t(`form.errors.${errors.notes.message}`) : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.notes'),
            ...register('notes'),
          }}
        />
        <FormField
          label={t('parties.labels.reason')}
          error={
            errors.reason
              ? t(`form.errors.${errors.reason.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.reason'),
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
            ? t('parties.submitting')
            : result
              ? t('parties.save')
              : t('parties.create')}
        </Button>
        {result ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!window.confirm(t('parties.result.archiveConfirm'))) return;
              void trigger('archive');
            }}
            disabled={submitting}
          >
            {submitting ? t('parties.submitting') : t('parties.archive')}
          </Button>
        ) : null}
      </div>
      <OperationResult
        status={status}
        successLabel={t('parties.result.title')}
        errorTitle={t('parties.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={
          result
            ? [
                { label: t('parties.result.name'), value: result.displayName },
                { label: t('parties.result.status'), value: result.status },
              ]
            : undefined
        }
      />
    </form>
  );
}
