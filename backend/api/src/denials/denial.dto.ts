import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateDenialDto {
  @IsUUID()
  @IsOptional()
  subjectUserId?: string;

  @IsString()
  @IsNotEmpty()
  permissionKey!: string;

  @IsString()
  @IsOptional()
  resourceType?: string;

  @IsString()
  @IsOptional()
  resourceId?: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;
}

export enum DenialListStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  ALL = 'ALL',
}
