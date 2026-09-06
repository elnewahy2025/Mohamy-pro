'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PortalClient, ApiError, type PortalCase } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { OperationResult } from '@/components/forms/operation-result';

export function PortalCasesSection(): React.ReactNode {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new PortalClient());
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [cases, setCases] = useState<PortalCase[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setCases(await client.myCases());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  if (!user) {
    return (
      <div className="section-card">
        <p>{t('common.signInRequired')}</p>
      </div>
    );
  }

  return (
    <div className="section-card">
      <h3>{t('portal.sections.cases.heading')}</h3>
      <p>{t('portal.sections.cases.description')}</p>

      <div className="form-actions form-actions-row mt-6">
        <Button type="button" variant="default" onClick={() => void runLoad()} disabled={status === 'submitting'}>
          {status === 'submitting' ? t('portal.submitting') : t('portal.load')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('portal.result.title')}
          errorTitle={t('portal.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[{ label: t('portal.result.total'), value: String(cases.length) }]}
        />
      )}

      {status === 'success' && cases.length > 0 && (
        <ul className="mt-4 space-y-2">
          {cases.map((c) => (
            <li key={c.id} className="text-sm">
              {c.caseNumber} — {c.status} · {c.priority}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
