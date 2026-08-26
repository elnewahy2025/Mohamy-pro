import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticationError } from '../auth/auth.errors';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  AuthorizationService,
  sessionToAuthorizationSubject,
} from './authorization.service';
import { AUTHORIZATION_POLICY_METADATA } from './require-policy.decorator';
import type { PolicyName } from './authorization.types';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<PolicyName>(
      AUTHORIZATION_POLICY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) {
      throw new Error('AuthorizationGuard requires a named policy');
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = request.authSession;
    if (!session) throw new AuthenticationError();
    const routeTenantId = request.params?.tenantId;
    const targetTenantId =
      (typeof routeTenantId === 'string' ? routeTenantId : undefined) ??
      session.activeTenantId ??
      undefined;
    const decision = await this.authorization.assertAuthorized({
      policy,
      subject: sessionToAuthorizationSubject(session),
      targetTenantId,
    });
    request.authorizationDecision = decision;
    return true;
  }
}
