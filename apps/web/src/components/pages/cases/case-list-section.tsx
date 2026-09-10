'use client';

import { useEffect, useState } from 'react';
import { ListFilter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CasesClient, type CaseListRow } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { EntityPicker } from '@/components/forms/entity-picker';

export function CaseListSection({
  onSelect,
}: {
  onSelect: (row: CaseListRow | null) => void;
}): React.ReactNode {
  const t = useTranslations();
  const [client] = useState(() => new CasesClient());
  const [recent, setRecent] = useState<CaseListRow[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    void client
      .list({ page: 1, limit: 10 })
      .then((result) => setRecent(result.data))
      .catch(() => setRecent([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
      {recent.length > 0 && (
        <ul className="mt-4 space-y-2">
          {recent.map((item) => (
            <li key={item.id} className="text-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSelect(item)}
              >
                {item.caseNumber} — {item.client.displayName} [{item.status}]
              </Button>
            </li>
          ))}
        </ul>
      )}
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
