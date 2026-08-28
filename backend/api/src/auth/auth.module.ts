import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityService } from './identity.service';
import { OidcProviderService } from './oidc/oidc-provider.service';
import { SessionCookieService } from './session/session-cookie.service';
import { SessionGuard } from './session/session.guard';
import { CsrfGuard } from './session/csrf.guard';
import { SessionService } from './session/session.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    IdentityService,
    OidcProviderService,
    SessionService,
    SessionCookieService,
    SessionGuard,
    CsrfGuard,
  ],
  exports: [SessionService, SessionGuard, CsrfGuard, SessionCookieService],
})
export class AuthModule {}
