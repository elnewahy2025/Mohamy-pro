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
        <ul className="mt-4 space-y-2">
          {summary.activity.map((event) => (
            <li key={event.id} className="text-sm">
              {event.occurredAt.slice(0, 10)} — {event.eventType} (
              {event.caseId.slice(0, 8)})
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm">—</p>
      )}
    </div>
  );
}
