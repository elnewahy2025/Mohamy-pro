'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  CasesClient,
  type CaseListRow,
  type CaseTimelineEvent,
  type CaseTimelineEventType,
  type CaseTimelineListResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const listSchema = z.object({
  caseId: z.string().min(1, 'invalid').max(100, 'tooLong'),
});
type ListForm = z.infer<typeof listSchema>;

const appendSchema = z.object({
  caseId: z.string().max(100, 'tooLong').optional(),
  eventType: z.string().min(1, 'invalid').max(64, 'tooLong'),
  payload: z.string().max(2000, 'tooLong').optional(),
});
type AppendForm = z.infer<typeof appendSchema>;

export function CaseTimelineSection({
  selected,
}: {
  selected: CaseListRow | null;
}): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new CasesClient());
  const [listStatus, setListStatus] = useState<'idle' | 'success' | 'error'>(
    'idle',
  );
  const [appendStatus, setAppendStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [timeline, setTimeline] = useState<CaseTimelineListResult | null>(null);
  const [appended, setAppended] = useState<CaseTimelineEvent | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  const {
    register: registerList,
    handleSubmit: handleSubmitList,
    formState: { errors: listErrors },
  } = useForm<ListForm>({
    resolver: zodResolver(listSchema),
    defaultValues: { caseId: '' },
  });

  const {
    register: registerAppend,
    handleSubmit: handleSubmitAppend,
    reset: resetAppend,
    formState: { errors: appendErrors },
  } = useForm<AppendForm>({
    resolver: zodResolver(appendSchema),
    defaultValues: { caseId: '', eventType: '', payload: '' },
  });

  useEffect(() => {
    if (selected) void runList({ caseId: selected.id });
    else setTimeline(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function runList(form: ListForm, targetPage = page): Promise<void> {
    setSubmitting(true);
    setListStatus('idle');
    setSubmitError(null);
    try {
      const result = await client.getTimeline(form.caseId, {
        page: targetPage,
        limit: 20,
      });
      setTimeline(result);
      setPage(targetPage);
      setListStatus('success');
    } catch (error) {
      setListStatus('error');
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

  async function runAppend(form: AppendForm): Promise<void> {
    setSubmitting(true);
    setAppendStatus('idle');
    setSubmitError(null);
    try {
      let payload: Record<string, unknown> | undefined;
      if (form.payload && form.payload.trim()) {
        payload = JSON.parse(form.payload) as Record<string, unknown>;
      }
      if (!selected) {
        setAppendStatus('error');
        setSubmitError(new ApiError('No case selected', 'NO_CASE', [], 0));
        setSubmitting(false);
        return;
      }
      const result = await client.appendTimelineEvent({
        caseId: selected.id,
        eventType: form.eventType as CaseTimelineEventType,
        payload,
      });
      setAppended(result);
      setAppendStatus('success');
      resetAppend({ caseId: '', eventType: '', payload: '' });
    } catch (error) {
      setAppendStatus('error');
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

  const totalPages = timeline
    ? Math.max(
        1,
        Math.ceil(timeline.pagination.total / timeline.pagination.limit),
      )
    : 1;

  return (
    <div className="settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <History size={18} />
        </span>
        <div>
          <h2>{t('casesTimeline.sections.timeline.heading')}</h2>
          <p>{t('casesTimeline.sections.timeline.description')}</p>
        </div>
      </div>
      {selected ? (
        <p className="form-field-hint">
          {selected.caseNumber} [{selected.status}]
        </p>
      ) : null}
      {timeline && totalPages > 1 ? (
        <div className="form-actions form-actions-row mt-4 mb-4">
          {page > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void runList(
                  { caseId: timeline.data[0]?.caseId ?? selected?.id ?? '' },
                  page - 1,
                )
              }
              disabled={submitting}
            >
              {t('casesTimeline.pagination.prev')}
            </Button>
          ) : null}
          <span style={{ margin: 'auto 1rem' }}>
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void runList(
                  { caseId: timeline.data[0]?.caseId ?? selected?.id ?? '' },
                  page + 1,
                )
              }
              disabled={submitting}
            >
              {t('casesTimeline.pagination.next')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {timeline && timeline.data.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {timeline.data.map((event: CaseTimelineEvent) => {
            const key = `casesTimeline.events.${event.eventType}`;
            const label = t.has(key) ? t(key) : event.eventType;
            return (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <span>{label}</span>
                <span>
                  {new Date(event.occurredAt).toISOString()} ·{' '}
                  <code>{event.eventType}</code>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmitAppend(runAppend)();
        }}
      >
        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <FormField
            label={t('casesTimeline.labels.eventType')}
            error={
              appendErrors.eventType
                ? t(`form.errors.${appendErrors.eventType.message}`)
                : undefined
            }
            inputProps={{
              type: 'text',
              autoComplete: 'off',
              placeholder: t('casesTimeline.placeholders.eventType'),
              ...registerAppend('eventType'),
            }}
          />
          <FormField
            label={t('casesTimeline.labels.payload')}
            error={
              appendErrors.payload
                ? t(`form.errors.${appendErrors.payload.message}`)
                : undefined
            }
            inputProps={{
              type: 'text',
              autoComplete: 'off',
              placeholder: t('casesTimeline.placeholders.payload'),
              ...registerAppend('payload'),
            }}
          />
        </div>
        <div className="form-actions form-actions-row">
          <Button
            type="submit"
            variant="default"
            disabled={submitting || authLoading || !user || !selected}
          >
            {submitting
              ? t('casesTimeline.submitting')
              : t('casesTimeline.append')}
          </Button>
        </div>
      </form>
      <OperationResult
        status={appendStatus}
        successLabel={t('casesTimeline.result.title')}
        errorTitle={t('casesTimeline.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={
          appended
            ? [
                { label: t('casesTimeline.result.id'), value: appended.id },
                {
                  label: t('casesTimeline.result.eventType'),
                  value: appended.eventType,
                },
                {
                  label: t('casesTimeline.result.occurredAt'),
                  value: appended.occurredAt,
                },
              ]
            : undefined
        }
      />
    </div>
  );
}
