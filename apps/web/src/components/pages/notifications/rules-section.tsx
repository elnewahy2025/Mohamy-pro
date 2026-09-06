'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import { NotificationsClient, type NotificationRuleResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';
import type { ApiError } from '@/lib/api';

const ruleSchema = z.object({
  eventType: z.enum(['INVOICE_ISSUED', 'HEARING_SCHEDULED', 'DEADLINE_CREATED']),
  channels: z.string().min(1, 'invalid'),
  audience: z.enum(['ASSIGNEES', 'ALL_MEMBERS']),
  escalationHours: z.string().optional().or(z.literal('')),
  escalateToMembershipId: z.string().optional().or(z.literal('')),
});
type RuleForm = z.infer<typeof ruleSchema>;

export function RulesSection() {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new NotificationsClient());
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [rules, setRules] = useState<NotificationRuleResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { eventType: 'INVOICE_ISSUED', channels: 'IN_APP', audience: 'ASSIGNEES', escalationHours: '', escalateToMembershipId: '' },
  });

  async function runCreate(form: RuleForm): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      await client.createRule({
        eventType: form.eventType,
        channels: form.channels.split(',').map((c) => c.trim()).filter(Boolean) as never,
        audience: form.audience,
        escalationHours: form.escalationHours ? Number(form.escalationHours) : undefined,
        escalateToMembershipId: form.escalateToMembershipId || undefined,
      });
      setRules(await client.listRules());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setSubmitError(e as ApiError);
    }
  }

  async function runLoad(): Promise<void> {
    setStatus('submitting');
    setSubmitError(null);
    try {
      setRules(await client.listRules());
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
      <h3>{t('notifications.sections.rules.heading')}</h3>
      <p>{t('notifications.sections.rules.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormSelect
            label={t('notifications.labels.eventType')}
            error={errors.eventType ? t(`form.errors.${errors.eventType.message}`) : undefined}
            options={['INVOICE_ISSUED', 'HEARING_SCHEDULED', 'DEADLINE_CREATED'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('eventType'),
            }}
          />
          <FormField
            label={t('notifications.labels.channels')}
            error={errors.channels ? t(`form.errors.${errors.channels.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('notifications.placeholders.channels'),
              ...register('channels'),
            }}
          />
          <FormSelect
            label={t('notifications.labels.audience')}
            error={errors.audience ? t(`form.errors.${errors.audience.message}`) : undefined}
            options={['ASSIGNEES', 'ALL_MEMBERS'].map((v) => ({ label: v, value: v }))}
            selectProps={{
              ...register('audience'),
            }}
          />
          <FormField
            label={t('notifications.labels.escalationHours')}
            error={errors.escalationHours ? t(`form.errors.${errors.escalationHours.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('notifications.placeholders.escalationHours'),
              ...register('escalationHours'),
            }}
          />
          <FormField
            label={t('notifications.labels.escalateTo')}
            error={errors.escalateToMembershipId ? t(`form.errors.${errors.escalateToMembershipId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('notifications.placeholders.escalateTo'),
              ...register('escalateToMembershipId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('notifications.submitting') : t('notifications.create')}
          </Button>
          <Button type="button" variant="outline" disabled={status === 'submitting'} onClick={() => void runLoad()}>
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
            fields={[{ label: t('notifications.result.id'), value: String(rules.length) }]}
          />
        )}

        {status === 'success' && rules.length > 0 && (
          <ul className="mt-4 space-y-2">
            {rules.map((rule) => (
              <li key={rule.id} className="text-sm">
                {rule.eventType} → {rule.channels.join(', ')} ({rule.audience})
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
