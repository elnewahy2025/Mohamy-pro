import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfOriginMiddleware } from './csrf-origin.middleware';
import { OIDC_CLIENT } from './oidc-client.port';
import { OidcClient } from './oidc.client';
import { OidcTransactionStore } from './oidc-transaction.store';
import { SessionCryptoService } from './session-crypto.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';
import { IdempotencyModule } from '../infrastructure/idempotency/idempotency.module';
import { Phase2BusinessInterceptor } from '../common/http/phase2-business.interceptor';
import { MembershipService } from './membership.service';
import { TenantSessionController } from './tenant-session.controller';
import { AuthorizationController } from '../authorization/authorization.controller';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [IdempotencyModule, AuthorizationModule],
  controllers: [
    AuthController,
    TenantSessionController,
    AuthorizationController,
  ],
  providers: [
    AuthService,
    CsrfOriginMiddleware,
    OidcClient,
    { provide: OIDC_CLIENT, useExisting: OidcClient },
    OidcTransactionStore,
    SessionCryptoService,
    SessionGuard,
    SessionService,
    Phase2BusinessInterceptor,
    MembershipService,
  ],
  exports: [
    AuthService,
    SessionGuard,
    SessionService,
    Phase2BusinessInterceptor,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfOriginMiddleware).forRoutes('*');
  }
}
