import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BootstrapConfigService } from './bootstrap.config';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [AuthModule],
  controllers: [BootstrapController],
  providers: [BootstrapService, BootstrapConfigService],
})
export class BootstrapModule {}
