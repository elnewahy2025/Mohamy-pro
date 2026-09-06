'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { NotificationsClient, type NotificationResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { OperationResult } from '@/components/forms/operation-result';
import type { ApiError } from '@/lib/api';

export function InboxSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new NotificationsClient());
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [items, setItems] = useState<NotificationResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setItems(await client.inbox());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runRead(id: string): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      await client.markRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'READ' } : n)));
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
      <h3>{t('notifications.sections.inbox.heading')}</h3>
      <p>{t('notifications.sections.inbox.description')}</p>

      <div className="form-actions form-actions-row mt-6">
        <Button type="button" variant="default" onClick={() => void runLoad()} disabled={status === 'submitting'}>
          {status === 'submitting' ? t('notifications.submitting') : t('notifications.load')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('notifications.result.title')}
          errorTitle={t('notifications.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[{ label: t('notifications.result.id'), value: String(items.length) }]}
        />
      )}

      {status === 'success' && items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>[{item.status}] {item.title} — {item.body.slice(0, 80)}</span>
              {item.status !== 'READ' ? (
                <Button type="button" variant="outline" onClick={() => void runRead(item.id)}>
                  {t('notifications.markRead')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
