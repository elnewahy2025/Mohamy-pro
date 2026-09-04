'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ListFilter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  ClientsClient,
  type ClientListResult,
  type ClientResult,
  type ClientStatus,
  type ClientType,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const filterSchema = z.object({
  search: z.string().max(200, 'tooLong').optional(),
  status: z.string().optional(),
  clientType: z.string().optional(),
});
type FilterForm = z.infer<typeof filterSchema>;

export function ClientListSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ClientsClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [list, setList] = useState<ClientListResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<FilterForm>({ search: '', status: '', clientType: '' });
  const [page, setPage] = useState(1);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FilterForm>({
    resolver: zodResolver(filterSchema),
    defaultValues: { search: '', status: '', clientType: '' },
  });

  async function runList(targetPage = page): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.listClients({
        page: targetPage,
        limit: 20,
        search: filters.search || undefined,
        status: (filters.status || undefined) as ClientStatus | undefined,
        clientType: (filters.clientType || undefined) as ClientType | undefined,
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
      setFilters({ search: form.search ?? '', status: form.status ?? '', clientType: form.clientType ?? '' });
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
          <h2>{t('clients.sections.list')}</h2>
          <p>{t('clients.entity.list.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('clients.labels.search')}
          error={errors.search ? t(`form.errors.${errors.search.message}`) : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('clients.placeholders.search'),
            ...register('search'),
          }}
        />
        <FormSelect
          label={t('clients.labels.status')}
          selectProps={register('status')}
          options={[
            { label: t('common.enums.ACTIVE'), value: 'ACTIVE' },
            { label: t('common.enums.ARCHIVED'), value: 'ARCHIVED' },
          ]}
        />
        <FormSelect
          label={t('clients.labels.clientType')}
          selectProps={register('clientType')}
          options={[
            { label: t('common.enums.INDIVIDUAL'), value: 'INDIVIDUAL' },
            { label: t('common.enums.ORGANIZATION'), value: 'ORGANIZATION' },
          ]}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void search()} disabled={submitting || authLoading || !user}>
          {submitting ? t('clients.submitting') : t('clients.result.list')}
        </Button>
        {list && page > 1 ? (
          <Button type="button" variant="outline" onClick={() => void runList(page - 1)} disabled={submitting}>
            {t('clients.pagination.prev')}
          </Button>
        ) : null}
        {list && page < totalPages ? (
          <Button type="button" variant="outline" onClick={() => void runList(page + 1)} disabled={submitting}>
            {t('clients.pagination.next')}
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
        fields={list ? [
          { label: t('clients.result.total'), value: String(list.pagination.total) },
          { label: t('clients.result.page'), value: `${page} / ${totalPages}` },
        ] : undefined}
      />
      {list && list.data.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {list.data.map((item: ClientResult) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{item.displayName}</span>
              <span>
                {item.clientType} · {item.status} · <code>{item.id}</code>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
