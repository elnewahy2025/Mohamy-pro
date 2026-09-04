'use client';

import { useState, useEffect } from 'react';
import { Network } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ApiError,
  WorkflowsClient,
  type WorkflowResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';

export function WorkflowListSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new WorkflowsClient());
  const [list, setList] = useState<WorkflowResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (user) {
      void loadWorkflows();
    }
  }, [user]);

  async function loadWorkflows(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listWorkflows();
      setList(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(err instanceof Error ? err.message : 'Unknown error', 'INTERNAL', [], 0),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true"><Network size={18} /></span>
        <div>
          <h2>{t('workflows.sections.list')}</h2>
          <p>{t('workflows.description')}</p>
        </div>
      </div>
      
      <div className="form-actions form-actions-row">
        <Button type="button" variant="outline" onClick={() => void loadWorkflows()} disabled={loading || authLoading || !user}>
          {loading ? t('workflows.submitting') : t('legalConfig.list')}
        </Button>
      </div>

      {error ? (
        <div className="operation-result-details" style={{ marginTop: '1rem', color: 'var(--destructive-500)' }}>
          <strong>{t('workflows.result.errorTitle')}</strong>
          <p>{error.message}</p>
        </div>
      ) : null}

      {list && list.length > 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          {list.map((item: WorkflowResult) => {
            const latestVersion = item.versions && item.versions.length > 0 ? item.versions[0] : null;
            return (
              <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--gray-200)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{item.name}</strong>
                  <span><code>{item.id}</code></span>
                </div>
                {item.caseType && <div>{t('workflows.labels.caseType')}: {item.caseType}</div>}
                {latestVersion ? (
                  <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)' }}>
                    v{latestVersion.version}  {t(`common.enums.${latestVersion.status}`)}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.9rem', color: 'var(--gray-500)' }}>No versions</div>
                )}
              </div>
            );
          })}
        </div>
      ) : list && list.length === 0 ? (
        <div className="operation-result-details" style={{ marginTop: '1rem' }}>
          No workflows found.
        </div>
      ) : null}
    </div>
  );
}
