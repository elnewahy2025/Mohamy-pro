import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CURRENCIES } from './currency.constants';

export class CreateBranchDto {
  @ApiProperty({ format: 'uuid', description: 'Parent organization.' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ example: 'cairo', description: 'Unique slug.' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug!: string;

  @ApiProperty({ example: 'Cairo Office', description: 'Display name.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  mapUrl?: string;

  @ApiPropertyOptional({ enum: [...CURRENCIES] })
  @IsOptional()
  @IsIn([...CURRENCIES])
  operatingCurrency?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  workingHours?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  managerName?: string;

  @ApiPropertyOptional({ description: 'Mark as head office (singleton).' })
  @IsOptional()
  @IsBoolean()
  isHeadOffice?: boolean;
}

export class UpdateBranchDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  mapUrl?: string;

  @ApiPropertyOptional({ enum: [...CURRENCIES] })
  @IsOptional()
  @IsIn([...CURRENCIES])
  operatingCurrency?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  workingHours?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  managerName?: string;

  @ApiPropertyOptional({ description: 'Mark as head office (singleton).' })
  @IsOptional()
  @IsBoolean()
  isHeadOffice?: boolean;
}

export class ArchiveBranchDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
