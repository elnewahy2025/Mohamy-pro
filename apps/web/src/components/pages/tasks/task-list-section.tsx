'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/auth/auth-provider';
import { TasksClient, CasesClient, type TaskResult, type CaseListRow } from '@/lib/api';
import { FormSelect } from '@/components/forms/form-select';
import { Button } from '@/components/ui/button';

export function TaskListSection() {
  const t = useTranslations();
  const { user } = useAuth();
  
  const [tasks, setTasks] = useState<TaskResult[]>([]);
  const [cases, setCases] = useState<CaseListRow[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  
  const client = new TasksClient();
  const casesClient = new CasesClient();

  const fetchTasks = () => {
    if (user) {
      client.listTasks(selectedCaseId || undefined).then(res => setTasks(res.data)).catch(() => {});
    }
  };

  useEffect(() => {
    if (user) {
      casesClient.list().then(res => setCases(res.data)).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    fetchTasks();
  }, [user, selectedCaseId]);

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      await client.updateStatus(id, { status: newStatus });
      fetchTasks();
    } catch (e) {
      // Ignore
    }
  };

  return (
    <div className="section-card">
      <h3>{t('tasks.sections.list')}</h3>
      <p>{t('tasks.description')}</p>

      <div className="form-grid mb-6 mt-4">
        <FormSelect
          label={t('tasks.labels.caseId')}
          options={[{ label: 'All Cases', value: '' }, ...cases.map(c => ({ label: c.caseNumber, value: c.id }))]}
          selectProps={{
            value: selectedCaseId,
            onChange: (e) => setSelectedCaseId(e.target.value),
          }}
        />
      </div>

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">No tasks found.</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="p-4 border rounded-md">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-medium text-gray-900">{task.title}</h4>
                  {task.dueDate && (
                    <p className="text-sm text-gray-500">
                      Due: {new Date(task.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    task.status === 'BLOCKED' ? 'bg-red-100 text-red-800' :
                    task.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    task.status === 'CANCELLED' ? 'bg-gray-100 text-gray-800' :
                    task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {t(`common.enums.${task.status}`) || task.status}
                  </span>
                  <span className={`text-xs border px-1.5 py-0.5 rounded ${
                    task.priority === 'CRITICAL' ? 'border-red-500 text-red-600' :
                    task.priority === 'HIGH' ? 'border-orange-500 text-orange-600' :
                    task.priority === 'MEDIUM' ? 'border-blue-500 text-blue-600' :
                    'border-gray-300 text-gray-500'
                  }`}>
                    {t(`common.enums.${task.priority}`) || task.priority}
                  </span>
                </div>
              </div>
              
              {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                <div className="mt-4 pt-4 border-t flex gap-2">
                  {task.status !== 'IN_PROGRESS' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(task.id, 'IN_PROGRESS')}>
                      {t('common.enums.IN_PROGRESS')}
                    </Button>
                  )}
                  {task.status !== 'COMPLETED' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(task.id, 'COMPLETED')}>
                      {t('common.enums.COMPLETED')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
