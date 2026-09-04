'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ListFilter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  PartyClient,
  type HierarchyStatus,
  type PartyListResult,
  type PartyResult,
  type PartyType,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const filterSchema = z.object({
  search: z.string().max(200, 'tooLong').optional(),
  status: z.string().optional(),
  partyType: z.string().optional(),
});
type FilterForm = z.infer<typeof filterSchema>;

export function PartyListSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new PartyClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [list, setList] = useState<PartyListResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<FilterForm>({ search: '', status: '', partyType: '' });
  const [page, setPage] = useState(1);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FilterForm>({
    resolver: zodResolver(filterSchema),
    defaultValues: { search: '', status: '', partyType: '' },
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
        status: (filters.status || undefined) as HierarchyStatus | undefined,
        partyType: (filters.partyType || undefined) as PartyType | undefined,
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
      setFilters({ search: form.search ?? '', status: form.status ?? '', partyType: form.partyType ?? '' });
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
          <h2>{t('parties.sections.list')}</h2>
          <p>{t('parties.entity.list.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('parties.labels.search')}
          error={errors.search ? t(`form.errors.${errors.search.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.search'),
            ...register('search'),
          }}
        />
        <FormField
          label={t('parties.labels.status')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.status'),
            ...register('status'),
          }}
        />
        <FormField
          label={t('parties.labels.partyType')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('parties.placeholders.partyTypeFilter'),
            ...register('partyType'),
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void search()} disabled={submitting || authLoading || !user}>
          {submitting ? t('parties.submitting') : t('parties.result.list')}
        </Button>
        {list && page > 1 ? (
          <Button type="button" variant="outline" onClick={() => void runList(page - 1)} disabled={submitting}>
            {t('parties.pagination.prev')}
          </Button>
        ) : null}
        {list && page < totalPages ? (
          <Button type="button" variant="outline" onClick={() => void runList(page + 1)} disabled={submitting}>
            {t('parties.pagination.next')}
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
        fields={list ? [
          { label: t('parties.result.total'), value: String(list.pagination.total) },
          { label: t('parties.result.page'), value: `${page} / ${totalPages}` },
        ] : undefined}
      />
      {list && list.data.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {list.data.map((item: PartyResult) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{item.displayName}</span>
              <span>
                {item.partyType} · {item.status} · <code>{item.id}</code>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
