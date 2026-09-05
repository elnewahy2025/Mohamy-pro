import { OpenSearchAdapter } from './opensearch.adapter';
import { SearchUnavailableError } from '../search-unavailable.error';

describe('OpenSearchAdapter', () => {
  const ctx = { tenantId: 't1', userId: 'u1' } as any;

  it('fails closed instead of returning fabricated results', async () => {
    const adapter = new OpenSearchAdapter();

    await expect(
      adapter.search({ query: 'contract', page: 1, pageSize: 25 }, ctx),
    ).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  it('fails closed on suggestions and index writes', async () => {
    const adapter = new OpenSearchAdapter();

    await expect(adapter.suggest('cont', ctx)).rejects.toBeInstanceOf(
      SearchUnavailableError,
    );
    await expect(
      adapter.indexDocument('idx', 'e1', { tenantId: 't1' }),
    ).rejects.toBeInstanceOf(SearchUnavailableError);
    await expect(adapter.deleteDocument('idx', 'e1')).rejects.toBeInstanceOf(
      SearchUnavailableError,
    );
  });
});
