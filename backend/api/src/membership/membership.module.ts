import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembershipAdminController } from './admin/membership-admin.controller';
import { MembershipAdminService } from './admin/membership-admin.service';
import { InvitationController } from './invitation/invitation.controller';
import { InvitationService } from './invitation/invitation.service';

@Module({
  imports: [AuthModule],
  controllers: [InvitationController, MembershipAdminController],
  providers: [InvitationService, MembershipAdminService],
})
export class MembershipModule {}
