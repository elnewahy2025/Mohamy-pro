'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as LinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  PartyClient,
  type PartyRelationshipListResult,
  type PartyRelationshipResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const relationshipSchema = z.object({
  id: z.string().optional(),
  fromPartyId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  toPartyId: z.string().min(1, 'invalid').max(100, 'tooLong'),
  relationshipType: z.string().min(1, 'invalid').max(255, 'tooLong'),
});
type RelationshipForm = z.infer<typeof relationshipSchema>;

type ActionKey = 'create' | 'list';

export function PartyRelationshipSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new PartyClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<PartyRelationshipResult | null>(null);
  const [relationships, setRelationships] = useState<PartyRelationshipListResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RelationshipForm>({
    resolver: zodResolver(relationshipSchema),
    defaultValues: {
      id: '',
      fromPartyId: '',
      toPartyId: '',
      relationshipType: '',
    },
  });

  async function run(action: ActionKey, form: RelationshipForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      if (action === 'list') {
        const result = await client.listRelationships(form.fromPartyId, { page: 1, limit: 20 });
        setRelationships(result);
        setCreated(null);
      } else {
        const result = await client.createRelationship({
          fromPartyId: form.fromPartyId,
          toPartyId: form.toPartyId,
          relationshipType: form.relationshipType,
        });
        setCreated(result);
        setRelationships(null);
        reset({ id: '', fromPartyId: '', toPartyId: '', relationshipType: '' });
      }
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

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true"><LinkIcon size={18} /></span>
        <div>
          <h2>{t('parties.sections.relationship')}</h2>
          <p>{t('parties.entity.relationship.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('parties.labels.fromPartyId')}
          error={errors.fromPartyId ? t(`form.errors.${errors.fromPartyId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.fromPartyId'),
            ...register('fromPartyId'),
          }}
        />
        <FormField
          label={t('parties.labels.toPartyId')}
          error={errors.toPartyId ? t(`form.errors.${errors.toPartyId.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.toPartyId'),
            ...register('toPartyId'),
          }}
        />
        <FormField
          label={t('parties.labels.relationshipType')}
          error={errors.relationshipType ? t(`form.errors.${errors.relationshipType.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.relationshipType'),
            ...register('relationshipType'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void trigger('create')} disabled={submitting || authLoading || !user}>
          {submitting ? t('parties.submitting') : t('parties.create')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void trigger('list')} disabled={submitting || authLoading || !user}>
          {submitting ? t('parties.submitting') : t('parties.result.list')}
        </Button>
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
        fields={created ? [
          { label: t('parties.result.id'), value: created.id },
          { label: t('parties.labels.relationshipType'), value: created.relationshipType },
        ] : relationships ? [
          { label: t('parties.result.total'), value: String(relationships.pagination.total) },
        ] : undefined}
      />
      {relationships && relationships.data.length > 0 ? (
        <ul className="operation-result-details" style={{ marginTop: '1rem', listStyle: 'none', padding: 0 }}>
          {relationships.data.map((rel: PartyRelationshipResult) => (
            <li key={rel.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{rel.relationshipType}</span>
              <span>
                {rel.toParty?.displayName ?? rel.toPartyId} · <code>{rel.id}</code>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
