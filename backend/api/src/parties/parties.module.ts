import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PartyOperations } from './party.operations';
import { PartyService } from './party.service';
import { PartyRoleService } from './party-role.service';
import { PartyRelationshipService } from './party-relationship.service';
import { PartyController } from './party.controller';

@Module({
  imports: [AuthModule],
  controllers: [PartyController],
  providers: [
    PartyOperations,
    PartyService,
    PartyRoleService,
    PartyRelationshipService,
  ],
  exports: [PartyService],
})
export class PartiesModule {}
