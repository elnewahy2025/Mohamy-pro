import { Module } from '@nestjs/common';
import { AbuseModule } from '../abuse/abuse.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityService } from './identity.service';
import { OidcProviderService } from './oidc/oidc-provider.service';
import { SessionCookieService } from './session/session-cookie.service';
import { SessionGuard } from './session/session.guard';
import { CsrfGuard } from './session/csrf.guard';
import { SessionService } from './session/session.service';
import { TenantSwitchController } from './session/tenant-switch.controller';
import { TenantSwitchService } from './session/tenant-switch.service';
import { MfaAssuranceService } from './mfa/mfa-assurance.service';

@Module({
  imports: [AbuseModule],
  controllers: [AuthController, TenantSwitchController],
  providers: [
    AuthService,
    IdentityService,
    OidcProviderService,
    SessionService,
    SessionCookieService,
    SessionGuard,
    CsrfGuard,
    TenantSwitchService,
    MfaAssuranceService,
  ],
  exports: [
    SessionService,
    SessionGuard,
    CsrfGuard,
    SessionCookieService,
    MfaAssuranceService,
  ],
})
export class AuthModule {}
