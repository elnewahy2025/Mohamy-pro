export class OidcConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OidcConfigurationError';
  }
}

export class OidcProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OidcProviderUnavailableError';
  }
}

export class OidcInteractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OidcInteractionError';
  }
}

export class OidcTokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OidcTokenValidationError';
  }
}

export class SessionNotAuthenticatedError extends Error {
  constructor(message = 'Authentication is required') {
    super(message);
    this.name = 'SessionNotAuthenticatedError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(message = 'Session not found') {
    super(message);
    this.name = 'SessionNotFoundError';
  }
}

export class CsrfMismatchError extends Error {
  constructor(message = 'CSRF validation failed') {
    super(message);
    this.name = 'CsrfMismatchError';
  }
}
