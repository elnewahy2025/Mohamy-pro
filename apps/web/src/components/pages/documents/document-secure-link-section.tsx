'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck, Copy, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  DocumentsClient,
  type DocumentResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const secureLinkSchema = z.object({
  documentId: z.string().min(1, 'required'),
  purpose: z.string().min(1, 'required'),
});

type SecureLinkForm = z.infer<typeof secureLinkSchema>;

export function DocumentSecureLinkSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new DocumentsClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [documents, setDocuments] = useState<DocumentResult[]>([]);
  
  const [generatedLink, setGeneratedLink] = useState<{ url: string; expiresAt: Date } | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SecureLinkForm>({
    resolver: zodResolver(secureLinkSchema),
    defaultValues: { documentId: '', purpose: '' },
  });

  useEffect(() => {
    if (user) {
      client.listDocuments().then(res => setDocuments(res.data)).catch(() => {});
    }
  }, [user, client]);

  async function generateLink(form: SecureLinkForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    setGeneratedLink(null);
    setCopied(false);

    try {
      // Find the document to get its primary version id
      const doc = documents.find(d => d.id === form.documentId);
      const versionId = doc?.versions?.[0]?.id || 'v-default';

      const result = await client.generateAccessGrant(form.documentId, { 
        documentVersionId: versionId, 
        purpose: form.purpose 
      });

      // Usually it returns relative path to web proxy or full url
      const fullUrl = `${window.location.origin}${result.data.signedUrl}`;
      setGeneratedLink({
        url: fullUrl,
        expiresAt: new Date(result.data.expiresAt)
      });
      
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(error instanceof Error ? error.message : 'Unknown error', 'INTERNAL', [], 0),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const copyToClipboard = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <form className="settings-card" onSubmit={handleSubmit(generateLink)} noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true"><ShieldCheck size={18} /></span>
        <div>
          <h2>{t('documents.secureLinks.title')}</h2>
          <p>{t('documents.secureLinks.description')}</p>
        </div>
      </div>

      <div className="form-grid">
        <FormSelect
          label={t('documents.secureLinks.form.documentId')}
          error={errors.documentId?.message ? String(errors.documentId.message) : undefined}
          selectProps={register('documentId')}
          options={[
            { label: 'Select a document...', value: '' },
            ...documents.map(d => ({ label: d.title, value: d.id }))
          ]}
        />
        <FormField
          label={t('documents.secureLinks.form.purpose')}
          error={errors.purpose?.message ? String(errors.purpose.message) : undefined}
          inputProps={{
            ...register('purpose'),
            placeholder: 'e.g., EXTERNAL_REVIEW',
          }}
        />
      </div>

      <div className="form-actions form-actions-row mt-4">
        <Button type="submit" variant="default" disabled={submitting || authLoading || !user}>
          {submitting ? '...' : t('documents.secureLinks.form.generate')}
        </Button>
      </div>

      <OperationResult
        status={status}
        successLabel={t('documents.secureLinks.form.success')}
        errorTitle="Error generating link"
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
      />

      {status === 'success' && generatedLink && (
        <div className="mt-6 p-4 bg-green-50/50 border border-green-100 rounded-lg animate-in fade-in slide-in-from-bottom-2">
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-sm font-medium text-green-800">{t('documents.secureLinks.form.url')}</span>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-white p-2 rounded border border-green-200 text-sm overflow-x-auto text-green-900">
                  {generatedLink.url}
                </code>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={copyToClipboard}
                  className="shrink-0 bg-white"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-green-800">{t('documents.secureLinks.form.expiresAt')}: </span>
              <span className="text-sm text-green-700">{generatedLink.expiresAt.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
