'use client';

import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  PartyClient,
  type PartyResult,
} from '@/lib/api';
import { EntityPicker } from '@/components/forms/entity-picker';

export function PartyListSection({
  onSelect,
}: {
  onSelect: (party: PartyResult | null) => void;
}): React.ReactNode {
  const t = useTranslations();
  const [client] = useState(() => new PartyClient());

  return (
    <div className="settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <ListFilter size={18} />
        </span>
        <div>
          <h2>{t('parties.sections.list')}</h2>
          <p>{t('parties.entity.list.description')}</p>
        </div>
      </div>
      <div className="form-grid mt-6">
        <EntityPicker
          label={t('parties.labels.search') || 'Search Parties'}
          placeholder={t('parties.placeholders.search')}
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
              label: c.displayName,
              sub: `${c.partyType} · ${c.status}`,
              data: c,
            }));
          }}
        />
      </div>
    </div>
  );
}
