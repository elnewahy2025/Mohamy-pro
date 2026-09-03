export class DocumentAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentAccessDeniedError';
  }
}

export class DocumentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentNotFoundError';
  }
}

export class DocumentInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentInvalidStateError';
  }
}
