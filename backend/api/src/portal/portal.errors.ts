export class PortalAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalAccessDeniedError';
  }
}

export class PortalNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalNotFoundError';
  }
}
