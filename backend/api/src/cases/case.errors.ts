import { BadRequestException } from '@nestjs/common';
import type { GateVerdict } from '../conflict-checks/conflict-gate.service';

export class CaseAccessDeniedError extends Error {
  constructor(message = 'Case not found or access denied') {
    super(message);
    this.name = 'CaseAccessDeniedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CaseGateRejectionError extends BadRequestException {
  constructor(message: string, blocks: GateVerdict['blocks']) {
    super({
      message,
      error: 'Conflict Check Gate Blocked',
      blocks,
    });
  }
}
