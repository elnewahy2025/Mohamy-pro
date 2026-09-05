export interface ProviderPushInput {
  connectionId: string;
  localType: string;
  localId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
}

export interface ProviderPushResult {
  externalId: string;
  etag?: string;
}

export interface ProviderPullResult {
  externalId: string;
  etag?: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  deleted?: boolean;
}

/**
 * Live Google/Microsoft calls are deferred (Phase 23 plan §7). Providers
 * implement this interface when OAuth token storage (Vault) and API clients
 * land; until then no implementation exists and sync rests at mapping state.
 */
export interface CalendarProvider {
  pushEvent(input: ProviderPushInput): Promise<ProviderPushResult>;
  pullChanges(
    connectionId: string,
    syncToken?: string,
  ): Promise<{
    changes: ProviderPullResult[];
    nextSyncToken: string;
  }>;
}
