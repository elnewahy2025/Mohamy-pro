'use client';

import { useEffect, useState } from 'react';
import { OrgConfigClient, type OrgContext } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';

export function OrgBrand(): React.ReactNode {
  const { user } = useAuth();
  const [client] = useState(() => new OrgConfigClient());
  const [context, setContext] = useState<OrgContext | null>(null);

  useEffect(() => {
    if (!user) {
      setContext(null);
      return;
    }
    void client
      .context()
      .then(setContext)
      .catch(() => setContext(null));
  }, [user, client]);

  if (!context?.organization) return null;

  return (
    <span className="org-brand" aria-label={context.organization.name}>
      {context.organization.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={context.organization.logoUrl}
          alt=""
          width={22}
          height={22}
          style={{ borderRadius: '6px', objectFit: 'cover' }}
        />
      ) : null}
      <span>
        <strong>{context.organization.name}</strong>
        {context.branch ? <small> · {context.branch.name}</small> : null}
      </span>
    </span>
  );
}
