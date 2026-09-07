import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const CRON_5 = /^(\S+) (\S+) (\S+) (\S+) (\S+)$/;

export class SetBackupPolicyDto {
  @IsInt()
  @Min(1)
  @Max(720)
  rpoHours!: number;

  @IsInt()
  @Min(1)
  @Max(720)
  rtoHours!: number;

  @IsString()
  @Matches(CRON_5)
  scheduleCron!: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  retentionDays!: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class StartDrillDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  targetRef!: string;
}

export class DrillCheckDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsBoolean()
  passed!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  evidence!: string;
}

export class FinishDrillDto {
  @IsBoolean()
  passed!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DrillCheckDto)
  checks!: DrillCheckDto[];

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  note?: string;
}
