'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ListFilter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  CasesClient,
  type CaseListResult,
  type CaseListRow,
  type CaseStatus,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const filterSchema = z.object({
  search: z.string().max(200, 'tooLong').optional(),
  status: z.string().optional(),
});
type FilterForm = z.infer<typeof filterSchema>;

export function CaseListSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new CasesClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [list, setList] = useState<CaseListResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<FilterForm>({ search: '', status: '' });
  const [page, setPage] = useState(1);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FilterForm>({
    resolver: zodResolver(filterSchema),
    defaultValues: { search: '', status: '' },
  });

  async function runList(targetPage = page): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.list({
        page: targetPage,
        limit: 20,
        search: filters.search || undefined,
        status: (filters.status || undefined) as CaseStatus | undefined,
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
      setFilters({ search: form.search ?? '', status: form.status ?? '' });
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
        <span className="settings-icon" aria-hidden="true"><ListFilter size={18} /></span>
        <div>
          <h2>{t('cases.sections.list')}</h2>
          <p>{t('cases.entity.list.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('cases.labels.caseNumber')}
          error={errors.search ? t(`form.errors.${errors.search.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('cases.placeholders.search'),
            ...register('search'),
          }}
        />
        <FormSelect
          label={t('cases.labels.status')}
          selectProps={register('status')}
          options={[
            { label: t('common.enums.OPEN'), value: 'OPEN' },
            { label: t('common.enums.ON_HOLD'), value: 'ON_HOLD' },
            { label: t('common.enums.CLOSED'), value: 'CLOSED' },
          ]}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void search()} disabled={submitting || authLoading || !user}>
          {submitting ? t('cases.submitting') : t('cases.result.list')}
        </Button>
        {list && page > 1 ? (
          <Button type="button" variant="outline" onClick={() => void runList(page - 1)} disabled={submitting}>
            {t('cases.pagination.prev')}
          </Button>
        ) : null}
        {list && page < totalPages ? (
          <Button type="button" variant="outline" onClick={() => void runList(page + 1)} disabled={submitting}>
            {t('cases.pagination.next')}
          </Button>
        ) : null}
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
        fields={list ? [
          { label: t('cases.result.total'), value: String(list.pagination.total) },
          { label: t('cases.result.page'), value: `${page} / ${totalPages}` },
        ] : undefined}
      />
      {list && list.data.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {list.data.map((item: CaseListRow) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{item.caseNumber} — {item.client.displayName}</span>
              <span>
                {item.status} · {item.priority} · <code>{item.id}</code>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
