'use client';

import { useTranslations } from 'next-intl';
import type { DashboardSummary } from '@/lib/api';

export function UpcomingSection({ summary }: { summary: DashboardSummary }) {
  const t = useTranslations();

  return (
    <div className="section-card">
      <h3>{t('dashboard.sections.upcoming.heading')}</h3>
      <p>{t('dashboard.sections.upcoming.description')}</p>

      {summary.hearings.next.length > 0 && (
        <ul className="mt-4 space-y-2">
          {summary.hearings.next.map((hearing) => (
            <li key={hearing.id} className="text-sm">
              {hearing.date.slice(0, 10)} —{' '}
              {hearing.hearingType ?? hearing.status} (
              {hearing.caseId.slice(0, 8)})
            </li>
          ))}
        </ul>
      )}

      {summary.deadlines.next.length > 0 && (
        <ul className="mt-4 space-y-2">
          {summary.deadlines.next.map((deadline) => (
            <li key={deadline.id} className="text-sm">
              {deadline.dueDate.slice(0, 10)} — {deadline.title} [
              {deadline.status}]
            </li>
          ))}
        </ul>
      )}

      {summary.hearings.next.length === 0 &&
        summary.deadlines.next.length === 0 && (
          <p className="mt-4 text-sm">—</p>
        )}
    </div>
  );
}
