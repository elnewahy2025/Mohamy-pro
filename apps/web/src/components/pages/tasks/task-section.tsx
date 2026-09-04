'use client';

import { useState, useEffect } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import {
  TasksClient,
  CasesClient,
  type TaskResult,
  type CaseListRow,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const taskSchema = z.object({
  caseId: z.string().optional().or(z.literal('')),
  title: z.string().min(1, 'invalid'),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  dueDate: z.string().optional().or(z.literal('')),
  assignedUserId: z.string().optional().or(z.literal('')),
  parentTaskId: z.string().optional().or(z.literal('')),
});
type TaskForm = z.infer<typeof taskSchema>;

export function TaskSection() {
  const t = useTranslations();
  const { user } = useAuth();
  
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<TaskResult | null>(null);
  
  const [cases, setCases] = useState<CaseListRow[]>([]);
  const [tasks, setTasks] = useState<TaskResult[]>([]);

  useEffect(() => {
    if (user) {
      const casesClient = new CasesClient();
      const tasksClient = new TasksClient();
      casesClient.list().then(res => setCases(res.data)).catch(() => {});
      tasksClient.listTasks().then(res => setTasks(res.data)).catch(() => {});
    }
  }, [user]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: { caseId: '', title: '', description: '', priority: 'MEDIUM', dueDate: '', assignedUserId: '', parentTaskId: '' },
  });

  async function runCreate(form: TaskForm): Promise<void> {
    try {
      const client = new TasksClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.createTask({
        caseId: form.caseId || undefined,
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        assignedUserId: form.assignedUserId || undefined,
        parentTaskId: form.parentTaskId || undefined,
      });
      setCreated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  return (
    <div className="section-card">
      <h3>{t('tasks.sections.create')}</h3>
      <p>{t('tasks.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormSelect
            label={t('tasks.labels.caseId')}
            error={errors.caseId ? t(`form.errors.${errors.caseId.message}`) : undefined}
            options={[{ label: 'None', value: '' }, ...cases.map(c => ({ label: c.caseNumber, value: c.id }))]}
            selectProps={{
              ...register('caseId'),
            }}
          />
          <FormField
            label={t('tasks.labels.title')}
            error={errors.title ? t(`form.errors.${errors.title.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('tasks.placeholders.title'),
              ...register('title'),
            }}
          />
          <FormField
            label={t('tasks.labels.description')}
            error={errors.description ? t(`form.errors.${errors.description.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('tasks.placeholders.description'),
              ...register('description'),
            }}
          />
          <FormSelect
            label={t('tasks.labels.priority')}
            error={errors.priority ? t(`form.errors.${errors.priority.message}`) : undefined}
            options={[
              { label: t('common.enums.LOW') || 'Low', value: 'LOW' },
              { label: t('common.enums.MEDIUM') || 'Medium', value: 'MEDIUM' },
              { label: t('common.enums.HIGH') || 'High', value: 'HIGH' },
              { label: t('common.enums.CRITICAL') || 'Critical', value: 'CRITICAL' },
            ]}
            selectProps={{
              ...register('priority'),
            }}
          />
          <FormField
            label={t('tasks.labels.dueDate')}
            error={errors.dueDate ? t(`form.errors.${errors.dueDate.message}`) : undefined}
            inputProps={{
              type: 'date',
              ...register('dueDate'),
            }}
          />
          <FormSelect
            label={t('tasks.labels.parentTaskId')}
            error={errors.parentTaskId ? t(`form.errors.${errors.parentTaskId.message}`) : undefined}
            options={[{ label: 'None', value: '' }, ...tasks.map(t => ({ label: t.title, value: t.id }))]}
            selectProps={{
              ...register('parentTaskId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('tasks.submitting') : t('tasks.create')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('tasks.result.title')}
            errorTitle={t('tasks.result.errorTitle')}
            fields={created ? [{ label: t('tasks.result.id'), value: created.id }] : undefined}
          />
        )}
      </form>
    </div>
  );
}
