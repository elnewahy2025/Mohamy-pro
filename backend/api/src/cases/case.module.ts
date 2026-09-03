import { Module } from '@nestjs/common';
import { CaseController } from './case.controller';
import { CaseService } from './case.service';
import { CaseOperations } from './case.operations';

@Module({
  controllers: [CaseController],
  providers: [CaseService, CaseOperations],
  exports: [CaseService, CaseOperations],
})
export class CaseModule {}
