import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { TimeEntryService } from './time-entry.service';
import { TimeEntryController } from './time-entry.controller';
import { TimerService } from './timer.service';
import { TimerController } from './timer.controller';
import { RateService } from './rate.service';
import { RateController } from './rate.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TimeEntryController, TimerController, RateController],
  providers: [TimeEntryService, TimerService, RateService],
  exports: [TimeEntryService, TimerService, RateService],
})
export class TimeTrackingModule {}
