import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { CurrencyCode, RateType } from '@prisma/client';

export class CreateTimeEntryDto {
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsDateString()
  date!: string;

  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsBoolean()
  @IsOptional()
  isBillable?: boolean;

  @IsNumber()
  @IsOptional()
  rateAmount?: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode;
}

export class CreateRateDto {
  @IsEnum(RateType)
  type!: RateType;

  @IsString()
  @IsNotEmpty()
  referenceId!: string;

  @IsNumber()
  hourlyRate!: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode;

  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;
}

export class StartTimerDto {
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
