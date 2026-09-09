'use client';

import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ConflictChecksClient,
  type ConflictCheckListRow,
} from '@/lib/api';
import { EntityPicker } from '@/components/forms/entity-picker';

export function ConflictCheckListSection({
  onSelect,
}: {
  onSelect: (check: ConflictCheckListRow | null) => void;
}): React.ReactNode {
  const t = useTranslations();
  const [client] = useState(() => new ConflictChecksClient());

  return (
    <div className="settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <ListChecks size={18} />
        </span>
        <div>
          <h2>{t('conflictChecks.sections.list')}</h2>
          <p>{t('conflictChecks.entity.list.description')}</p>
        </div>
      </div>
      <div className="form-grid mt-6">
        <EntityPicker
          label={t('conflictChecks.sections.list') || 'Search Conflict Checks'}
          placeholder={t('common.search')}
          value=""
          onChange={(id, option) => {
            if (option?.data) {
              onSelect(option.data);
            }
          }}
          load={async (search) => {
            const result = await client.list({
              page: 1,
              limit: 50,
            });
            // Client-side filtering since API doesn't support text search for checks
            const filtered = result.data.filter(c => 
              !search || c.decision?.toLowerCase().includes(search.toLowerCase()) || c.status?.toLowerCase().includes(search.toLowerCase())
            );
            return filtered.map((c) => ({
              id: c.id,
              label: `Check: ${c.status} · ${c.decision || 'No decision'}`,
              sub: `${c.partyCount} parties`,
              data: c,
            }));
          }}
        />
      </div>
    </div>
  );
}
