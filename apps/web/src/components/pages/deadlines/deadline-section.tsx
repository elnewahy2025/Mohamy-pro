'use client';

import { useState, useEffect } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import {
  DeadlinesClient,
  CasesClient,
  type DeadlineResult,
  type CaseListRow,
  type DeadlineRuleResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const deadlineSchema = z.object({
  caseId: z.string().uuid('invalid'),
  title: z.string().min(1, 'invalid'),
  description: z.string().optional(),
  deadlineType: z.enum(['FIXED', 'RELATIVE', 'RULE_BASED', 'MANUAL', 'RECURRING']),
  dueDate: z.string().min(1, 'invalid'),
  ruleId: z.string().optional().or(z.literal('')),
});
type DeadlineForm = z.infer<typeof deadlineSchema>;

export function DeadlineSection() {
  const t = useTranslations();
  const { user } = useAuth();
  
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<DeadlineResult | null>(null);
  
  const [cases, setCases] = useState<CaseListRow[]>([]);
  const [rules, setRules] = useState<DeadlineRuleResult[]>([]);

  useEffect(() => {
    if (user) {
      const casesClient = new CasesClient();
      const deadlinesClient = new DeadlinesClient();
      casesClient.list().then(res => setCases(res.data)).catch(() => {});
      deadlinesClient.listRules().then(res => setRules(res.data)).catch(() => {});
    }
  }, [user]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<DeadlineForm>({
    resolver: zodResolver(deadlineSchema),
    defaultValues: { caseId: '', title: '', description: '', deadlineType: 'FIXED', dueDate: '', ruleId: '' },
  });

  async function runCreate(form: DeadlineForm): Promise<void> {
    try {
      const client = new DeadlinesClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createDeadline({
        caseId: form.caseId,
        title: form.title,
        description: form.description || undefined,
        deadlineType: form.deadlineType,
        dueDate: new Date(form.dueDate).toISOString(),
        ruleId: form.ruleId || undefined,
      });
      setCreated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  return (
    <div className="section-card">
      <h3>{t('deadlines.sections.schedule')}</h3>
      <p>{t('deadlines.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormSelect
            label={t('deadlines.labels.caseId')}
            error={errors.caseId ? t(`form.errors.${errors.caseId.message}`) : undefined}
            options={cases.map(c => ({ label: c.caseNumber, value: c.id }))}
            selectProps={{
              ...register('caseId'),
            }}
          />
          <FormField
            label={t('deadlines.labels.title')}
            error={errors.title ? t(`form.errors.${errors.title.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('deadlines.placeholders.title'),
              ...register('title'),
            }}
          />
          <FormField
            label={t('deadlines.labels.description')}
            error={errors.description ? t(`form.errors.${errors.description.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('deadlines.placeholders.description'),
              ...register('description'),
            }}
          />
          <FormSelect
            label={t('deadlines.labels.deadlineType')}
            error={errors.deadlineType ? t(`form.errors.${errors.deadlineType.message}`) : undefined}
            options={[
              { label: t('common.enums.FIXED') || 'Fixed', value: 'FIXED' },
              { label: t('common.enums.RELATIVE') || 'Relative', value: 'RELATIVE' },
              { label: t('common.enums.RULE_BASED') || 'Rule Based', value: 'RULE_BASED' },
              { label: t('common.enums.MANUAL') || 'Manual', value: 'MANUAL' },
              { label: t('common.enums.RECURRING') || 'Recurring', value: 'RECURRING' },
            ]}
            selectProps={{
              ...register('deadlineType'),
            }}
          />
          <FormField
            label={t('deadlines.labels.dueDate')}
            error={errors.dueDate ? t(`form.errors.${errors.dueDate.message}`) : undefined}
            inputProps={{
              type: 'date',
              ...register('dueDate'),
            }}
          />
          <FormSelect
            label={t('deadlines.labels.ruleId')}
            error={errors.ruleId ? t(`form.errors.${errors.ruleId.message}`) : undefined}
            options={[{ label: 'No Rule', value: '' }, ...rules.map(r => ({ label: r.name, value: r.id }))]}
            selectProps={{
              ...register('ruleId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('deadlines.submitting') : t('deadlines.create')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('deadlines.result.title')}
            errorTitle={t('deadlines.result.errorTitle')}
            fields={created ? [{ label: t('deadlines.result.id'), value: created.id }] : undefined}
          />
        )}
      </form>
    </div>
  );
}
