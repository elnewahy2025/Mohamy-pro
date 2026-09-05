'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { BillingsClient, type LedgerEntryResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const ledgerSchema = z.object({
  caseId: z.string().optional().or(z.literal('')),
});
type LedgerForm = z.infer<typeof ledgerSchema>;

export function LedgerSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [entries, setEntries] = useState<LedgerEntryResult[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<LedgerForm>({
    resolver: zodResolver(ledgerSchema),
    defaultValues: { caseId: '' },
  });

  async function runLoad(form: LedgerForm): Promise<void> {
    try {
      const client = new BillingsClient();
      setStatus('submitting');
      setEntries([]);
      const result = await client.readLedger(form.caseId || undefined);
      setEntries(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('billing.sections.ledger.heading')}</h3>
      <p>{t('billing.sections.ledger.description')}</p>

      <form onSubmit={handleSubmit(runLoad)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('billing.labels.caseId')}
            error={errors.caseId ? t(`form.errors.${errors.caseId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('billing.placeholders.caseId'),
              ...register('caseId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('billing.submitting') : t('billing.load')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('billing.result.title')}
            errorTitle={t('billing.result.errorTitle')}
            fields={[{ label: t('billing.result.total'), value: String(entries.length) }]}
          />
        )}

        {status === 'success' && entries.length > 0 && (
          <ul className="mt-4 space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="text-sm">
                {entry.side} {entry.amount} {entry.currency}
                {entry.memo ? ` — ${entry.memo}` : ''}
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
