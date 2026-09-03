import { IsString, IsOptional, IsUUID, IsIn, MaxLength } from 'class-validator';
import { HierarchyStatus } from '@prisma/client';

export class CreateCountryDto {
  @IsString()
  @MaxLength(2)
  code: string;

  @IsString()
  @MaxLength(255)
  name: string;
}

export class CreateJurisdictionDto {
  @IsUUID()
  countryId: string;

  @IsString()
  @MaxLength(255)
  name: string;
}

export class CreateCourtDto {
  @IsUUID()
  jurisdictionId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  courtType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  department?: string;
}

export class CreateCourtLocationDto {
  @IsUUID()
  courtId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  city?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;
}

export class UpdateLegalConfigStatusDto {
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status: HierarchyStatus;
}
