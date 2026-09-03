import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConflictChecksModule } from '../conflict-checks/conflict-checks.module';
import { CaseController } from './case.controller';
import { CaseService } from './case.service';
import { CaseOperations } from './case.operations';

@Module({
  imports: [AuthModule, ConflictChecksModule],
  controllers: [CaseController],
  providers: [CaseService, CaseOperations],
  exports: [CaseService],
})
export class CaseModule {}
