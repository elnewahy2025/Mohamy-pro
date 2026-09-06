import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ReportDataSource, ReportFrequency } from '@prisma/client';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEnum(ReportDataSource)
  dataSource!: ReportDataSource;

  @IsArray()
  @IsString({ each: true })
  columns!: string[];

  @IsObject()
  @IsOptional()
  filters?: Record<string, string>;

  @IsString()
  @IsOptional()
  groupBy?: string;

  @IsString()
  @IsOptional()
  sortBy?: string;

  @IsString()
  @IsOptional()
  sortDir?: string;
}

export class CreateScheduleDto {
  @IsUUID()
  definitionId!: string;

  @IsEnum(ReportFrequency)
  frequency!: ReportFrequency;

  @IsString()
  @Matches(HHMM)
  runAt!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
