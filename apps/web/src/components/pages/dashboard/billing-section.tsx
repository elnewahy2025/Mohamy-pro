'use client';

import { useTranslations } from 'next-intl';
import type { DashboardSummary } from '@/lib/api';

export function BillingSection({ summary }: { summary: DashboardSummary }) {
  const t = useTranslations();
  const totals = Object.entries(summary.billing.unpaidTotals);

  return (
    <div className="section-card">
      <h3>{t('dashboard.sections.billing.heading')}</h3>
      <p>{t('dashboard.sections.billing.description')}</p>

      {totals.length > 0 ? (
        <div
          className="service-table mt-4"
          role="table"
          aria-label={t('dashboard.sections.billing.heading')}
        >
          {totals.map(([currency, total]) => (
            <div className="service-table-row" role="row" key={currency}>
              <strong>{currency}</strong>
              <span>{total}</span>
              <span>
                {summary.billing.unpaidInvoices} /{' '}
                {summary.billing.overdueInvoices}
              </span>
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
