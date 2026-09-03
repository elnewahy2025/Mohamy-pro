import { BadRequestException } from '@nestjs/common';

export class CaseAccessDeniedError extends Error {
  constructor(message = 'Case not found or access denied') {
    super(message);
    this.name = 'CaseAccessDeniedError';
  }
}

export class CaseGateRejectionError extends BadRequestException {
  constructor(message: string, public readonly blocks: any[]) {
    super({
      message,
      error: 'Conflict Check Gate Blocked',
      blocks,
    });
  }
}
