import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';
import { MfaAssuranceService } from './mfa-assurance.service';

@Module({
  imports: [DatabaseModule],
  providers: [AuthorizationService, MfaAssuranceService, AuthorizationGuard],
  exports: [AuthorizationService, AuthorizationGuard, MfaAssuranceService],
})
export class AuthorizationModule {}
