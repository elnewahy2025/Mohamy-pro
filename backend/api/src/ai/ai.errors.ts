export class AiAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiAccessDeniedError';
  }
}

export class AiNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiNotFoundError';
  }
}

export class AiInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiInvalidStateError';
  }
}

export class AiProviderUnavailableError extends Error {
  constructor() {
    super('No AI provider is configured for this tenant');
    this.name = 'AiProviderUnavailableError';
  }
}
