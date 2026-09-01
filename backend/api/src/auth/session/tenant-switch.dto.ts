import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TenantSwitchDto {
  @ApiProperty({
    description: 'The tenant the authenticated user intends to switch to.',
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000000',
  })
  @IsUUID()
  tenantId!: string;
}
