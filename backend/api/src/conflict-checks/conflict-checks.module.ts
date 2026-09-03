import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConflictCheckController } from './conflict-check.controller';
import { ConflictCheckService } from './conflict-check.service';
import { ConflictCheckOperations } from './conflict-check.operations';
import { ConflictMatchService } from './conflict-match.service';
import { ConflictGateService } from './conflict-gate.service';

@Module({
  imports: [AuthModule],
  controllers: [ConflictCheckController],
  providers: [
    ConflictCheckService,
    ConflictCheckOperations,
    ConflictMatchService,
    ConflictGateService,
  ],
  exports: [ConflictGateService],
})
export class ConflictChecksModule {}
