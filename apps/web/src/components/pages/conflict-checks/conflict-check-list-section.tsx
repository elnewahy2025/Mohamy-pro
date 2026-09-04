'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  ConflictChecksClient,
  type ConflictCheckListResult,
  type ConflictCheckListRow,
  type ConflictCheckStatus,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const filterSchema = z.object({
  status: z.string().max(50, 'tooLong').optional(),
});
type FilterForm = z.infer<typeof filterSchema>;

export function ConflictCheckListSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ConflictChecksClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [list, setList] = useState<ConflictCheckListResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<FilterForm>({ status: '' });
  const [page, setPage] = useState(1);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FilterForm>({
    resolver: zodResolver(filterSchema),
    defaultValues: { status: '' },
  });

  async function runList(targetPage = page): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.list({
        page: targetPage,
        limit: 20,
        status: (filters.status || undefined) as ConflictCheckStatus | undefined,
      });
      setList(result);
      setPage(targetPage);
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

  async function search(): Promise<void> {
    await handleSubmit((form) => {
      setFilters({ status: form.status ?? '' });
    })();
    setPage(1);
    await runList(1);
  }

  const totalPages = list
    ? Math.max(1, Math.ceil(list.pagination.total / list.pagination.limit))
    : 1;

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true"><ListChecks size={18} /></span>
        <div>
          <h2>{t('conflictChecks.sections.list')}</h2>
          <p>{t('conflictChecks.entity.list.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('conflictChecks.labels.status')}
          error={errors.status ? t(`form.errors.${errors.status.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('conflictChecks.placeholders.statusFilter'),
            ...register('status'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void search()} disabled={submitting || authLoading || !user}>
          {submitting ? t('conflictChecks.submitting') : t('conflictChecks.result.list')}
        </Button>
        {list && page > 1 ? (
          <Button type="button" variant="outline" onClick={() => void runList(page - 1)} disabled={submitting}>
            {t('conflictChecks.pagination.prev')}
          </Button>
        ) : null}
        {list && page < totalPages ? (
          <Button type="button" variant="outline" onClick={() => void runList(page + 1)} disabled={submitting}>
            {t('conflictChecks.pagination.next')}
          </Button>
        ) : null}
      </div>
      <OperationResult
        status={status}
        successLabel={t('conflictChecks.result.title')}
        errorTitle={t('conflictChecks.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={list ? [
          { label: t('conflictChecks.result.total'), value: String(list.pagination.total) },
          { label: t('conflictChecks.result.page'), value: `${page} / ${totalPages}` },
        ] : undefined}
      />
      {list && list.data.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {list.data.map((item: ConflictCheckListRow) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>
                {item.status} · {item.decision} · {item.partyCount} {t('conflictChecks.result.parties').toLowerCase()}
              </span>
              <span>
                <code>{item.id}</code>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
