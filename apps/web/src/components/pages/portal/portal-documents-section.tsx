'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PortalClient, ApiError, type PortalDocument } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { OperationResult } from '@/components/forms/operation-result';

export function PortalDocumentsSection(): React.ReactNode {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new PortalClient());
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setDocuments(await client.myDocuments());
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
      <h3>{t('portal.sections.documents.heading')}</h3>
      <p>{t('portal.sections.documents.description')}</p>

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
          fields={[{ label: t('portal.result.total'), value: String(documents.length) }]}
        />
      )}

      {status === 'success' && documents.length > 0 && (
        <ul className="mt-4 space-y-2">
          {documents.map((d) => (
            <li key={d.id} className="text-sm">
              {d.title} — {d.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
