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

      <ul className="mt-4 space-y-2">
        {totals.map(([currency, total]) => (
          <li key={currency} className="text-sm">
            {currency}: {total}
          </li>
        ))}
        {totals.length === 0 && <li className="text-sm">—</li>}
      </ul>
    </div>
  );
}
