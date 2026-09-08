'use client';

import { useTranslations } from 'next-intl';
import type { DashboardSummary } from '@/lib/api';

export function UpcomingSection({ summary }: { summary: DashboardSummary }) {
  const t = useTranslations();
  const hasRows =
    summary.hearings.next.length > 0 || summary.deadlines.next.length > 0;

  return (
    <div className="section-card">
      <h3>{t('dashboard.sections.upcoming.heading')}</h3>
      <p>{t('dashboard.sections.upcoming.description')}</p>

      {hasRows ? (
        <div
          className="service-table mt-4"
          role="table"
          aria-label={t('dashboard.sections.upcoming.heading')}
        >
          {summary.hearings.next.map((hearing) => (
            <div className="service-table-row" role="row" key={hearing.id}>
              <strong>{hearing.date.slice(0, 10)}</strong>
              <span>{hearing.hearingType ?? hearing.status}</span>
              <span>{hearing.status}</span>
              <span>{hearing.caseId.slice(0, 8)}</span>
            </div>
          ))}
          {summary.deadlines.next.map((deadline) => (
            <div className="service-table-row" role="row" key={deadline.id}>
              <strong>{deadline.dueDate.slice(0, 10)}</strong>
              <span>{deadline.title}</span>
              <span>{deadline.status}</span>
              <span>{deadline.caseId.slice(0, 8)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm">—</p>
      )}
    </div>
  );
}
