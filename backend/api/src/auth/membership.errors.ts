import { ConflictException, ForbiddenException } from '@nestjs/common';

export class TenantContextRequiredError extends ForbiddenException {
  constructor() {
    super('TENANT_CONTEXT_REQUIRED');
  }
}

export class TenantSwitchConflictError extends ConflictException {
  constructor() {
    super('TENANT_SWITCH_CONFLICT');
  }
}
