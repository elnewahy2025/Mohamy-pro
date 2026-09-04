'use client';

import { useState, useEffect } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import {
  DocumentsClient,
  CasesClient,
  type DocumentResult,
  type CaseListRow,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const documentSchema = z.object({
  caseId: z.string().optional().or(z.literal('')),
  title: z.string().min(1, 'invalid'),
  description: z.string().optional(),
  documentType: z.string().optional(),
});
type DocumentForm = z.infer<typeof documentSchema>;

export function DocumentCreateSection() {
  const t = useTranslations();
  const { user } = useAuth();
  
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<DocumentResult | null>(null);
  
  const [cases, setCases] = useState<CaseListRow[]>([]);

  useEffect(() => {
    if (user) {
      const casesClient = new CasesClient();
      casesClient.list().then(res => setCases(res.data)).catch(() => {});
    }
  }, [user]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<DocumentForm>({
    resolver: zodResolver(documentSchema),
    defaultValues: { caseId: '', title: '', description: '', documentType: '' },
  });

  async function runCreate(form: DocumentForm): Promise<void> {
    try {
      const client = new DocumentsClient();
      setStatus('submitting');
      setCreated(null);
      
      // Mocking storage object fields since physical storage is deferred
      const mockStorageId = crypto.randomUUID();
      const mockMimeType = 'application/pdf';
      const mockFileSize = 1024 * 1024; // 1 MB
      
      const result = await client.createDocument({
        caseId: form.caseId || undefined,
        title: form.title,
        description: form.description || undefined,
        documentType: form.documentType || undefined,
        storageObjectId: mockStorageId,
        mimeType: mockMimeType,
        fileSize: mockFileSize,
      });
      setCreated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  return (
    <div className="section-card">
      <h3>{t('documents.sections.create')}</h3>
      <p>{t('documents.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormSelect
            label={t('documents.labels.caseId')}
            error={errors.caseId ? t(`form.errors.${errors.caseId.message}`) : undefined}
            options={[{ label: 'None', value: '' }, ...cases.map(c => ({ label: c.caseNumber, value: c.id }))]}
            selectProps={{
              ...register('caseId'),
            }}
          />
          <FormField
            label={t('documents.labels.title')}
            error={errors.title ? t(`form.errors.${errors.title.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('documents.placeholders.title'),
              ...register('title'),
            }}
          />
          <FormField
            label={t('documents.labels.description')}
            error={errors.description ? t(`form.errors.${errors.description.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('documents.placeholders.description'),
              ...register('description'),
            }}
          />
          <FormField
            label={t('documents.labels.documentType')}
            error={errors.documentType ? t(`form.errors.${errors.documentType.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('documents.placeholders.documentType'),
              ...register('documentType'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('documents.submitting') : t('documents.create')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('documents.result.title')}
            errorTitle={t('documents.result.errorTitle')}
            fields={created ? [{ label: t('documents.result.id'), value: created.id }] : undefined}
          />
        )}
      </form>
    </div>
  );
}
