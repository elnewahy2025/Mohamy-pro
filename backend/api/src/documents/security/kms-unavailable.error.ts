export class KmsUnavailableError extends Error {
  constructor() {
    super(
      'KMS provider is not wired: connect Vault Transit before protecting data keys',
    );
    this.name = 'KmsUnavailableError';
  }
}
