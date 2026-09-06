'use client';

import { useTranslations } from 'next-intl';
import type { DashboardSummary } from '@/lib/api';

export function KpiSection({ summary }: { summary: DashboardSummary }) {
  const t = useTranslations();

  const kpis = [
    { label: t('dashboard.kpis.openCases'), value: summary.cases.open },
    {
      label: t('dashboard.kpis.overdueDeadlines'),
      value: summary.deadlines.overdue,
    },
    { label: t('dashboard.kpis.openTasks'), value: summary.tasks.open },
    {
      label: t('dashboard.kpis.unpaidInvoices'),
      value: summary.billing.unpaidInvoices,
    },
    {
      label: t('dashboard.kpis.unreadNotifications'),
      value: summary.notifications.unread,
    },
  ];

  return (
    <div className="section-card">
      <h3>{t('dashboard.sections.kpis.heading')}</h3>
      <p>{t('dashboard.sections.kpis.description')}</p>
      <div className="metrics-grid mt-4">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="metric-card">
            <div className="metric-card-top">
              <span>{kpi.label}</span>
            </div>
            <strong>{kpi.value}</strong>
          </article>
        ))}
      </div>
    </div>
  );
}
