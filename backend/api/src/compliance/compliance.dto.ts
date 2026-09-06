import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const RETENTION_TARGETS = ['AUDIT_EVENT'] as const;
export const HOLD_TARGETS = [
  'AUDIT_EVENT',
  'CASE',
  'CLIENT',
  'DOCUMENT',
] as const;

export class AuditQueryDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  eventType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  outcome?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  targetType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  targetId?: string;

  @IsISO8601()
  @IsOptional()
  from?: string;

  @IsISO8601()
  @IsOptional()
  to?: string;
}

export class CreateRetentionPolicyDto {
  @IsIn([...RETENTION_TARGETS])
  targetType!: string;

  @IsInt()
  @Min(1)
  @Max(30)
  retainYears!: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class CreateHoldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  reason!: string;

  @IsIn([...HOLD_TARGETS])
  @IsOptional()
  targetType?: string;

  @IsUUID()
  @IsOptional()
  targetId?: string;
}

export class ReleaseHoldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
