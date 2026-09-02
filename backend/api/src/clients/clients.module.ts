import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { ClientOperations } from './client.operations';

@Module({
  imports: [AuthModule],
  controllers: [ClientController],
  providers: [ClientService, ClientOperations],
})
export class ClientsModule {}
