import { IsString, IsOptional, IsIn, IsUUID } from 'class-validator';
import type { CreateCaseParams, AddCasePartyParams } from './case.service';

export class CreateCaseDto implements CreateCaseParams {
  @IsString()
  title!: string;

  @IsString()
  referenceNumber!: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export class AddCasePartyDto implements AddCasePartyParams {
  @IsUUID()
  partyId!: string;

  @IsString()
  partyRoleId!: string;
}
