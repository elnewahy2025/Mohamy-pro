export class RoleAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoleAccessDeniedError';
  }
}

export class RoleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoleNotFoundError';
  }
}

export class RoleInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoleInvalidStateError';
  }
}
