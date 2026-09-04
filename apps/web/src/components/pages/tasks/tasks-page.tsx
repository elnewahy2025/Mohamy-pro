'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TaskListSection } from '@/components/pages/tasks/task-list-section';
import { TaskSection } from '@/components/pages/tasks/task-section';
import { Button } from '@/components/ui/button';

export function TasksPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('tasks.eyebrow')}</p>
        <h1>{t('tasks.title')}</h1>
        <p>{t('tasks.description')}</p>
      </div>
      
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        <Button 
          variant={activeTab === 'list' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('list')}
        >
          {t('tasks.sections.list')}
        </Button>
        <Button 
          variant={activeTab === 'create' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('create')}
        >
          {t('tasks.sections.create')}
        </Button>
      </div>

      <div className="tab-content">
        {activeTab === 'list' && <TaskListSection />}
        {activeTab === 'create' && <TaskSection />}
      </div>
    </section>
  );
}
