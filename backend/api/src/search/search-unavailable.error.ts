export class SearchUnavailableError extends Error {
  constructor() {
    super(
      'Search provider is not wired: connect an OpenSearch client before serving search results',
    );
    this.name = 'SearchUnavailableError';
  }
}
