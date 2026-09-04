'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  OrgConfigClient,
  OrganizationSetting,
  OrganizationSettingList,
  SetOrganizationSettingResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const settingSchema = z.object({
  key: z.string().min(1, 'invalid').max(200, 'tooLong'),
  value: z.string(),
});
type SettingForm = z.infer<typeof settingSchema>;

type ActionKey = 'get' | 'put';

type SettingSuccess =
  | { kind: 'get'; setting: OrganizationSetting }
  | { kind: 'put'; result: SetOrganizationSettingResult }
  | { kind: 'list'; list: OrganizationSettingList };

export function SettingsSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new OrgConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [success, setSuccess] = useState<SettingSuccess | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SettingForm>({
    resolver: zodResolver(settingSchema),
    defaultValues: { key: '', value: '' },
  });

  async function run(action: ActionKey, form: SettingForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: SettingSuccess;
      if (action === 'get') {
        const setting = await client.getSetting(form.key);
        if (!setting) {
          throw new ApiError(t('orgConfig.result.notFound'), 'NOT_FOUND', [], 404);
        }
        next = { kind: 'get', setting };
      } else {
        let value: unknown = form.value;
        try {
          value = JSON.parse(form.value);
        } catch {
          value = form.value;
        }
        const result = await client.setSetting(form.key, value);
        next = { kind: 'put', result };
      }
      setSuccess(next);
      setStatus('success');
      if (action === 'put') reset({ key: '', value: '' });
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

  async function listSettings(): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const list = await client.listSettings({});
      setSuccess({ kind: 'list', list });
      setStatus('success');
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

  const resultFields = (() => {
    if (!success) return undefined;
    if (success.kind === 'get') {
      return [
        { label: t('orgConfig.result.id'), value: success.setting.key },
        { label: t('orgConfig.result.version'), value: String(success.setting.version) },
      ];
    }
    if (success.kind === 'put') {
      return [
        { label: t('orgConfig.result.id'), value: success.result.id },
        { label: t('orgConfig.result.version'), value: String(success.result.version) },
        { label: t('orgConfig.result.created'), value: String(success.result.created) },
      ];
    }
    return [
      { label: t('orgConfig.result.total'), value: String(success.list.pagination.total) },
    ];
  })();

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true"><Settings2 size={18} /></span>
        <div>
          <h2>{t('orgConfig.sections.settings')}</h2>
          <p>{t('orgConfig.entity.settings.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('orgConfig.labels.key')}
          error={errors.key ? t(`form.errors.${errors.key.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.key'),
            ...register('key'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.value')}
          error={errors.value ? undefined : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.value'),
            ...register('value'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void listSettings()} disabled={submitting || authLoading || !user}>
          {submitting ? t('orgConfig.submitting') : t('orgConfig.result.list')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('get')} disabled={submitting}>
          {submitting ? t('orgConfig.submitting') : t('orgConfig.result.get')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('put')} disabled={submitting}>
          {submitting ? t('orgConfig.submitting') : t('orgConfig.result.put')}
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
        fields={resultFields}
      />
      {success?.kind === 'list' && success.list.data.length > 0 ? (
        <ul className="operation-result-details" style={{ marginTop: '1rem' }}>
          {success.list.data.map((item) => (
            <li key={item.key}>{item.key}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
