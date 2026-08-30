import { IsUUID } from 'class-validator';

export class TenantSwitchDto {
  @IsUUID()
  tenantId!: string;
}
