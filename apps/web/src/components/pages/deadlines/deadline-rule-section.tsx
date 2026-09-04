'use client';

import { useState, useEffect } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import {
  DeadlinesClient,
  type DeadlineRuleResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const ruleSchema = z.object({
  name: z.string().min(1, 'invalid'),
  description: z.string().optional(),
  effectiveFrom: z.string().min(1, 'invalid'),
  effectiveTo: z.string().optional(),
});
type RuleForm = z.infer<typeof ruleSchema>;

export function DeadlineRuleSection() {
  const t = useTranslations();
  const { user } = useAuth();
  
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<DeadlineRuleResult | null>(null);
  
  const [rules, setRules] = useState<DeadlineRuleResult[]>([]);

  const fetchRules = () => {
    if (user) {
      const client = new DeadlinesClient();
      client.listRules().then(res => setRules(res.data)).catch(() => {});
    }
  };

  useEffect(() => {
    fetchRules();
  }, [user]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { name: '', description: '', effectiveFrom: '', effectiveTo: '' },
  });

  async function runCreate(form: RuleForm): Promise<void> {
    try {
      const client = new DeadlinesClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createRule({
        name: form.name,
        description: form.description || undefined,
        effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : undefined,
      });
      setCreated(result);
      setStatus('success');
      fetchRules();
    } catch (e) {
      setStatus('error');
    }
  }

  return (
    <div className="section-card">
      <h3>{t('deadlines.sections.rules')}</h3>
      <p>{t('deadlines.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('deadlines.labels.name')}
            error={errors.name ? t(`form.errors.${errors.name.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('deadlines.placeholders.name'),
              ...register('name'),
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
          <FormField
            label={t('deadlines.labels.effectiveFrom')}
            error={errors.effectiveFrom ? t(`form.errors.${errors.effectiveFrom.message}`) : undefined}
            inputProps={{
              type: 'date',
              ...register('effectiveFrom'),
            }}
          />
          <FormField
            label={t('deadlines.labels.effectiveTo')}
            error={errors.effectiveTo ? t(`form.errors.${errors.effectiveTo.message}`) : undefined}
            inputProps={{
              type: 'date',
              ...register('effectiveTo'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('deadlines.submitting') : t('deadlines.createRule')}
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

      <div className="mt-8 pt-6 border-t">
        <h4 className="font-medium text-gray-900 mb-4">Existing Rules</h4>
        <div className="space-y-4">
          {rules.length === 0 ? (
            <p className="text-sm text-gray-500">No rules found.</p>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="p-4 border rounded-md">
                <h5 className="font-medium text-gray-900">{r.name}</h5>
                {r.description && <p className="text-sm text-gray-500">{r.description}</p>}
                <div className="mt-2 text-xs text-gray-400">
                  Effective: {new Date(r.effectiveFrom).toLocaleDateString()}
                  {r.effectiveTo ? ` - ${new Date(r.effectiveTo).toLocaleDateString()}` : ' onwards'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
