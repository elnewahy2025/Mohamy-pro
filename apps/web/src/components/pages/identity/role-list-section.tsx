'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiClient, ApiError, type RoleResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { OperationResult } from '@/components/forms/operation-result';

export function RoleListSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [roles, setRoles] = useState<RoleResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function runList(): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setRoles(await client.listRoles());
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(error instanceof Error ? error.message : 'Unknown error', 'INTERNAL', [], 0),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <div>
          <h2>{t('identity.roles.sections.list')}</h2>
          <p>{t('identity.roles.description')}</p>
        </div>
      </div>
      <div className="form-actions form-actions-row">
        <Button type="button" variant="default" onClick={() => void runList()} disabled={submitting || authLoading || !user}>
          {submitting ? t('identity.roles.submitting') : t('identity.roles.list')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('identity.roles.resultTitle')}
        errorTitle={t('identity.roles.resultTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
      />
      {status === 'success' && roles.length > 0 && (
        <ul className="mt-4 space-y-2">
          {roles.map((role) => (
            <li key={role.id} className="text-sm">
              <code>{role.key}</code> — {role.name} ({role.permissions.length})
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
