import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { ClientOperations } from './client.operations';
import { ClientContactController } from './contact.controller';
import { ClientContactService } from './contact.service';
import { ClientAddressController } from './address.controller';
import { ClientAddressService } from './address.service';

@Module({
  imports: [AuthModule],
  controllers: [
    ClientController,
    ClientContactController,
    ClientAddressController,
  ],
  providers: [
    ClientService,
    ClientOperations,
    ClientContactService,
    ClientAddressService,
  ],
})
export class ClientsModule {}
