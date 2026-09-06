export class BreakGlassAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BreakGlassAccessDeniedError';
  }
}

export class BreakGlassNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BreakGlassNotFoundError';
  }
}

export class BreakGlassInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BreakGlassInvalidStateError';
  }
}
