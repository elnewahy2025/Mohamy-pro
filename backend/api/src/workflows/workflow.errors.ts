export class WorkflowAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowAccessDeniedError';
  }
}

export class WorkflowNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowNotFoundError';
  }
}

export class WorkflowInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowInvalidStateError';
  }
}
