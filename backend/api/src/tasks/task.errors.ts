export class TaskAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskAccessDeniedError';
  }
}

export class TaskNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskNotFoundError';
  }
}

export class TaskInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskInvalidStateError';
  }
}
