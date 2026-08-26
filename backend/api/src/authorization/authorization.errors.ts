import { ForbiddenException } from '@nestjs/common';

export class AuthorizationDeniedError extends ForbiddenException {
  constructor(code = 'AUTHORIZATION_DENIED') {
    super(code);
  }
}

export class MfaStepUpRequiredError extends ForbiddenException {
  constructor() {
    super('MFA_STEP_UP_REQUIRED');
  }
}
