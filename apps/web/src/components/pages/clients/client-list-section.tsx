'use client';

import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ClientsClient,
  type ClientResult,
} from '@/lib/api';
import { EntityPicker } from '@/components/forms/entity-picker';

export function ClientListSection({
  onSelect,
}: {
  onSelect: (client: ClientResult | null) => void;
}): React.ReactNode {
  const t = useTranslations();
  const [client] = useState(() => new ClientsClient());

  return (
    <div className="settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <ListFilter size={18} />
        </span>
        <div>
          <h2>{t('clients.sections.list')}</h2>
          <p>{t('clients.entity.list.description')}</p>
        </div>
      </div>
      <div className="form-grid mt-6">
        <EntityPicker
          label={t('clients.labels.search') || 'Search Clients'}
          placeholder={t('clients.placeholders.search')}
          value=""
          onChange={(id, option) => {
            if (option?.data) {
              onSelect(option.data);
            }
          }}
          load={async (search) => {
            const result = await client.listClients({
              page: 1,
              limit: 20,
              search: search || undefined,
            });
            return result.data.map((c) => ({
              id: c.id,
              label: c.displayName,
              sub: `${c.clientType} · ${c.status}`,
              data: c,
            }));
          }}
        />
      </div>
    </div>
  );
}
