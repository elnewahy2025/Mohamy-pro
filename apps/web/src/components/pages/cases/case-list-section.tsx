'use client';

import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CasesClient, type CaseListRow } from '@/lib/api';
import { EntityPicker } from '@/components/forms/entity-picker';

export function CaseListSection({
  onSelect,
}: {
  onSelect: (row: CaseListRow | null) => void;
}): React.ReactNode {
  const t = useTranslations();
  const [client] = useState(() => new CasesClient());

  return (
    <div className="settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <ListFilter size={18} />
        </span>
        <div>
          <h2>{t('cases.sections.list')}</h2>
          <p>{t('cases.entity.list.description')}</p>
        </div>
      </div>
      <div className="form-grid mt-6">
        <EntityPicker
          label={t('cases.labels.search') || 'Search Cases'}
          placeholder={t('cases.placeholders.search')}
          value=""
          onChange={(id, option) => {
            if (option?.data) {
              onSelect(option.data);
            }
          }}
          load={async (search) => {
            const result = await client.list({
              page: 1,
              limit: 20,
              search: search || undefined,
            });
            return result.data.map((c) => ({
              id: c.id,
              label: `${c.caseNumber} — ${c.client.displayName}`,
              sub: `${c.status} · ${c.priority}`,
              data: c,
            }));
          }}
        />
      </div>
    </div>
  );
}
