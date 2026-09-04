'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  CasesClient,
  type CaseDetail,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const detailSchema = z.object({
  id: z.string().min(1, 'invalid').max(100, 'tooLong'),
});
type DetailForm = z.infer<typeof detailSchema>;

export function CaseDetailSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new CasesClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DetailForm>({
    resolver: zodResolver(detailSchema),
    defaultValues: { id: '' },
  });

  async function run(form: DetailForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.get(form.id);
      setDetail(result);
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

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true"><Eye size={18} /></span>
        <div>
          <h2>{t('cases.getDetail')}</h2>
          <p>{t('cases.entity.case.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('cases.labels.id')}
          error={errors.id ? t(`form.errors.${errors.id.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.id'),
            ...register('id'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void handleSubmit(run)()} disabled={submitting || authLoading || !user}>
          {submitting ? t('cases.submitting') : t('cases.getDetail')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('cases.result.title')}
        errorTitle={t('cases.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={detail ? [
          { label: t('cases.result.id'), value: detail.id },
          { label: t('cases.result.caseNumber'), value: detail.caseNumber },
          { label: t('cases.result.status'), value: detail.status },
          { label: t('cases.result.priority'), value: detail.priority },
          { label: t('cases.result.client'), value: detail.client.displayName },
        ] : undefined}
      />
      {detail && detail.parties.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {detail.parties.map((entry) => (
            <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{entry.party.displayName}</span>
              <span>
                {entry.role.label} · {entry.party.partyType} · <code>{entry.id}</code>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
