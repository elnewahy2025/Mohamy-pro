'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/auth/auth-provider';
import { DocumentsClient, CasesClient, type DocumentResult, type CaseListRow } from '@/lib/api';
import { FormSelect } from '@/components/forms/form-select';
import { Button } from '@/components/ui/button';

export function DocumentListSection() {
  const t = useTranslations();
  const { user } = useAuth();
  
  const [documents, setDocuments] = useState<DocumentResult[]>([]);
  const [cases, setCases] = useState<CaseListRow[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  
  const client = new DocumentsClient();
  const casesClient = new CasesClient();

  const fetchDocuments = () => {
    if (user) {
      client.listDocuments(selectedCaseId || undefined).then(res => setDocuments(res.data)).catch(() => {});
    }
  };

  useEffect(() => {
    if (user) {
      casesClient.list().then(res => setCases(res.data)).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    fetchDocuments();
  }, [user, selectedCaseId]);

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      await client.updateStatus(id, { status: newStatus });
      fetchDocuments();
    } catch (e) {
      // Ignore
    }
  };

  return (
    <div className="section-card">
      <h3>{t('documents.sections.list')}</h3>
      <p>{t('documents.description')}</p>

      <div className="form-grid mb-6 mt-4">
        <FormSelect
          label={t('documents.labels.caseId')}
          options={[{ label: 'All Cases', value: '' }, ...cases.map(c => ({ label: c.caseNumber, value: c.id }))]}
          selectProps={{
            value: selectedCaseId,
            onChange: (e) => setSelectedCaseId(e.target.value),
          }}
        />
      </div>

      <div className="space-y-4">
        {documents.length === 0 ? (
          <p className="text-sm text-gray-500">No documents found.</p>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="p-4 border rounded-md flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium text-gray-900">{doc.title}</h4>
                  {doc.documentType && (
                    <p className="text-sm text-gray-500">
                      Type: {doc.documentType}
                    </p>
                  )}
                  {doc.description && (
                    <p className="text-sm text-gray-400 mt-1">{doc.description}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    doc.status === 'ARCHIVED' ? 'bg-gray-100 text-gray-800' :
                    doc.status === 'FINAL' ? 'bg-green-100 text-green-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {t(`common.enums.${doc.status}`) || doc.status}
                  </span>
                </div>
              </div>

              {doc.status !== 'ARCHIVED' && (
                <div className="mt-2 pt-2 border-t flex gap-2">
                  {doc.status !== 'FINAL' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(doc.id, 'FINAL')}>
                      {t('common.enums.FINAL')}
                    </Button>
                  )}
                  {doc.status !== 'ARCHIVED' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(doc.id, 'ARCHIVED')}>
                      {t('common.enums.ARCHIVED')}
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
