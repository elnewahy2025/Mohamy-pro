'use client';

import { useTranslations } from 'next-intl';
import type { DashboardSummary } from '@/lib/api';

export function ActivitySection({ summary }: { summary: DashboardSummary }) {
  const t = useTranslations();

  return (
    <div className="section-card">
      <h3>{t('dashboard.sections.activity.heading')}</h3>
      <p>{t('dashboard.sections.activity.description')}</p>

      {summary.activity.length > 0 ? (
        <div
          className="service-table mt-4"
          role="table"
          aria-label={t('dashboard.sections.activity.heading')}
        >
          {summary.activity.map((event) => (
            <div className="service-table-row" role="row" key={event.id}>
              <strong>{event.occurredAt.slice(0, 10)}</strong>
              <span>{event.eventType}</span>
              <span>{event.caseId.slice(0, 8)}</span>
              <span className="status-dot" aria-hidden="true" />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm">—</p>
      )}
    </div>
  );
}
