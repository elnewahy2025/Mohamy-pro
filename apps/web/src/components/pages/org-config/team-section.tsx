'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, OrgConfigClient, type TeamResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';
import { EntityPicker } from '@/components/forms/entity-picker';

const teamSchema = z.object({
  id: z.string().max(64).optional(),
  slug: z.string().min(1, 'invalid').max(100, 'tooLong'),
  name: z.string().min(1, 'invalid').max(200, 'tooLong'),
  description: z.string().max(500, 'tooLong').optional(),
  departmentId: z.string().min(1, 'invalidUuid'),
  reason: z.string().max(200, 'tooLong').optional(),
});
type TeamForm = z.infer<typeof teamSchema>;

type ActionKey = 'create' | 'update' | 'archive';

export function TeamSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new OrgConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<TeamResult | null>(null);
  const [items, setItems] = useState<TeamResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TeamForm>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      id: '',
      slug: '',
      name: '',
      description: '',
      departmentId: '',
      reason: '',
    },
  });

  async function run(action: ActionKey, form: TeamForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: TeamResult;
      if (action === 'create') {
        next = await client.createTeam({
          slug: form.slug,
          name: form.name,
          description: form.description || undefined,
          departmentId: form.departmentId,
        });
      } else if (action === 'update') {
        next = await client.updateTeam({
          id: form.id as string,
          slug: form.slug || undefined,
          name: form.name || undefined,
          description: form.description || null,
          departmentId: form.departmentId || undefined,
        });
      } else {
        next = await client.archiveTeam({
          id: form.id as string,
          reason: form.reason || undefined,
        });
      }
      setResult(next);
      setStatus('success');
      if (action === 'create')
        reset({
          id: '',
          slug: '',
          name: '',
          description: '',
          departmentId: '',
          reason: '',
        });
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

  useEffect(() => {
    if (user) void runList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function runList(): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setItems(await client.listTeams());
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
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <Users size={18} />
        </span>
        <div>
          <h2>{t('orgConfig.sections.team')}</h2>
          <p>{t('orgConfig.entity.team.description')}</p>
        </div>
      </div>
      {result ? (
        <p className="form-field-hint">
          {result.slug} — {result.name} [{result.status}]
        </p>
      ) : null}
      <div className="form-grid">
        <FormField
          label={t('orgConfig.labels.slug')}
          error={
            errors.slug ? t(`form.errors.${errors.slug.message}`) : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.slug'),
            ...register('slug'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.name')}
          error={
            errors.name ? t(`form.errors.${errors.name.message}`) : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.name'),
            ...register('name'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.description')}
          error={
            errors.description
              ? t(`form.errors.${errors.description.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.description'),
            ...register('description'),
          }}
        />
        <EntityPicker
          label={t('orgConfig.labels.departmentId')}
          placeholder={t('orgConfig.placeholders.departmentId')}
          required
          error={
            errors.departmentId
              ? t(`form.errors.${errors.departmentId.message}`)
              : undefined
          }
          value={watch('departmentId') ?? ''}
          onChange={(id) =>
            setValue('departmentId', id, { shouldValidate: true })
          }
          load={async () =>
            (await client.listDepartments()).map((d) => ({
              id: d.id,
              label: d.name,
              sub: d.slug,
            }))
          }
        />
        <FormField
          label={t('orgConfig.labels.reason')}
          error={
            errors.reason
              ? t(`form.errors.${errors.reason.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.reason'),
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
            ? t('orgConfig.submitting')
            : result
              ? t('orgConfig.save')
              : t('orgConfig.create')}
        </Button>
        {result ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!result) return;
              if (!window.confirm(t('orgConfig.result.archiveConfirm'))) return;
              void trigger('archive');
            }}
            disabled={submitting || !result}
          >
            {submitting ? t('orgConfig.submitting') : t('orgConfig.archive')}
          </Button>
        ) : null}{' '}
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
        fields={
          result
            ? [{ label: t('orgConfig.result.status'), value: result.status }]
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
                  setValue('slug', item.slug);
                  setValue('name', item.name);
                  setValue('description', item.description ?? '');
                  setValue('departmentId', item.departmentId ?? '');
                  setResult(item);
                }}
              >
                {item.slug} — {item.name} [{item.status}]
              </Button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
