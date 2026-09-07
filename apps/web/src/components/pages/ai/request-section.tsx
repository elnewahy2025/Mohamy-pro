'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AiClient,
  type AiRef,
  type ApiError,
  type AiRequestResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

function parseRefs(raw: string): AiRef[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const [kind, id] = part.split(':');
      return { kind: (kind ?? '').trim(), id: (id ?? '').trim() };
    });
}

export function RequestSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new AiClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [items, setItems] = useState<AiRequestResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [taskType, setTaskType] = useState('');
  const [refs, setRefs] = useState('');
  const [promptHint, setPromptHint] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setItems(await client.listRequests());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runCreate(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const created = await client.createRequest(
        taskType,
        parseRefs(refs),
        promptHint || undefined,
      );
      setCreatedId(created.id);
      setItems((prev) => [created, ...prev]);
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  if (!user) {
    return (
      <div className="section-card">
        <p>{t('common.signInRequired')}</p>
      </div>
    );
  }

  return (
    <div className="section-card">
      <h3>{t('ai.sections.request.heading')}</h3>
      <p>{t('ai.sections.request.description')}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runCreate();
        }}
      >
        <FormField
          label={t('ai.labels.taskType')}
          inputProps={{
            value: taskType,
            onChange: (e) => setTaskType(e.target.value),
            placeholder: t('ai.placeholders.taskType'),
            required: true,
          }}
        />
        <FormField
          label={t('ai.labels.refs')}
          inputProps={{
            value: refs,
            onChange: (e) => setRefs(e.target.value),
            placeholder: t('ai.placeholders.refs'),
            required: true,
          }}
        />
        <FormField
          label={t('ai.labels.promptHint')}
          inputProps={{
            value: promptHint,
            onChange: (e) => setPromptHint(e.target.value),
            placeholder: t('ai.placeholders.promptHint'),
          }}
        />
        <div className="form-actions form-actions-row mt-6">
          <Button
            type="submit"
            variant="default"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? t('ai.submitting') : t('ai.create')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void runLoad()}
            disabled={status === 'submitting'}
          >
            {t('ai.load')}
          </Button>
        </div>
      </form>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('ai.result.title')}
          errorTitle={t('ai.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[
            {
              label: t('ai.result.id'),
              value: createdId ?? String(items.length),
            },
          ]}
        />
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              [{item.status}] {item.taskType} — {item.refs.length} refs
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
