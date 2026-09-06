'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DashboardClient,
  type ApiError,
  type DashboardSummary,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { OperationResult } from '@/components/forms/operation-result';
import { KpiSection } from '@/components/pages/dashboard/kpi-section';
import { UpcomingSection } from '@/components/pages/dashboard/upcoming-section';
import { BillingSection } from '@/components/pages/dashboard/billing-section';
import { ActivitySection } from '@/components/pages/dashboard/activity-section';

export function DashboardPage(): React.ReactNode {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new DashboardClient());
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setSummary(await client.summary());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  if (!user) {
    return (
      <section className="page-section content-page">
        <p>{t('common.signInRequired')}</p>
      </section>
    );
  }

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('dashboard.eyebrow')}</p>
        <h1>{t('dashboard.title')}</h1>
        <p>{t('dashboard.description')}</p>
      </div>

      <div className="form-actions form-actions-row mb-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runLoad()}
          disabled={status === 'submitting'}
        >
          {status === 'submitting'
            ? t('dashboard.submitting')
            : t('dashboard.load')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('dashboard.result.title')}
          errorTitle={t('dashboard.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
        />
      )}

      {status === 'success' && summary && (
        <div className="tab-content">
          <KpiSection summary={summary} />
          <UpcomingSection summary={summary} />
          <BillingSection summary={summary} />
          <ActivitySection summary={summary} />
        </div>
      )}
    </section>
  );
}
