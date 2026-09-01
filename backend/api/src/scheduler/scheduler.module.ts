import { Module } from '@nestjs/common';
import { CleanupSchedulerService } from './cleanup-scheduler.service';

@Module({
  providers: [CleanupSchedulerService],
})
export class SchedulerModule {}
