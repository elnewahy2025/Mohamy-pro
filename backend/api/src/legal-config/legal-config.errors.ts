export class LegalConfigAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegalConfigAccessDeniedError';
  }
}
