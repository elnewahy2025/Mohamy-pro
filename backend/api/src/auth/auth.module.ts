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

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    CsrfOriginMiddleware,
    OidcClient,
    { provide: OIDC_CLIENT, useExisting: OidcClient },
    OidcTransactionStore,
    SessionCryptoService,
    SessionGuard,
    SessionService,
  ],
  exports: [AuthService, SessionGuard, SessionService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfOriginMiddleware).forRoutes('*');
  }
}
