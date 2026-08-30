import { Module } from '@nestjs/common';
import { BootstrapConfigService } from './bootstrap.config';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

@Module({
  controllers: [BootstrapController],
  providers: [BootstrapService, BootstrapConfigService],
})
export class BootstrapModule {}
