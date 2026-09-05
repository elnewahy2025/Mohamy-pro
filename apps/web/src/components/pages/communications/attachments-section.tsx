'use client';

import { useState } from 'react';
import { useForm as useRHForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';

import { CommsClient, type MessageAttachmentResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';

const attachmentSchema = z.object({
  messageId: z.string().min(1, 'invalid'),
  storageObjectId: z.string().min(1, 'invalid'),
  mimeType: z.string().min(1, 'invalid'),
  fileSize: z.string().min(1, 'invalid'),
});
type AttachmentForm = z.infer<typeof attachmentSchema>;

export function AttachmentsSection() {
  const t = useTranslations();
  const { user } = useAuth();

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [created, setCreated] = useState<MessageAttachmentResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useRHForm<AttachmentForm>({
    resolver: zodResolver(attachmentSchema),
    defaultValues: { messageId: '', storageObjectId: '', mimeType: '', fileSize: '' },
  });

  async function runCreate(form: AttachmentForm): Promise<void> {
    try {
      const client = new CommsClient();
      setStatus('submitting');
      setCreated(null);
      const result = await client.addAttachment(form.messageId, {
        storageObjectId: form.storageObjectId,
        mimeType: form.mimeType,
        fileSize: Number(form.fileSize),
      });
      setCreated(result);
      setStatus('success');
    } catch (e) {
      setStatus('error');
    }
  }

  if (!user) return null;

  return (
    <div className="section-card">
      <h3>{t('communications.sections.attachments.heading')}</h3>
      <p>{t('communications.sections.attachments.description')}</p>

      <form onSubmit={handleSubmit(runCreate)} className="space-y-6 mt-6">
        <div className="form-grid">
          <FormField
            label={t('communications.labels.messageId')}
            error={errors.messageId ? t(`form.errors.${errors.messageId.message}`) : undefined}
            inputProps={{
              type: 'text',
              placeholder: t('communications.placeholders.messageId'),
              ...register('messageId'),
            }}
          />
          <FormField
            label={t('communications.labels.storageObjectId')}
            error={errors.storageObjectId ? t(`form.errors.${errors.storageObjectId.message}`) : undefined}
            inputProps={{
              type: 'text',
              ...register('storageObjectId'),
            }}
          />
          <FormField
            label={t('communications.labels.mimeType')}
            error={errors.mimeType ? t(`form.errors.${errors.mimeType.message}`) : undefined}
            inputProps={{
              type: 'text',
              ...register('mimeType'),
            }}
          />
          <FormField
            label={t('communications.labels.fileSize')}
            error={errors.fileSize ? t(`form.errors.${errors.fileSize.message}`) : undefined}
            inputProps={{
              type: 'text',
              ...register('fileSize'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? t('communications.submitting') : t('communications.create')}
          </Button>
        </div>

        {(status === 'success' || status === 'error') && (
          <OperationResult
            status={status}
            successLabel={t('communications.result.title')}
            errorTitle={t('communications.result.errorTitle')}
            fields={created ? [{ label: t('communications.result.id'), value: created.id }] : undefined}
          />
        )}
      </form>
    </div>
  );
}
