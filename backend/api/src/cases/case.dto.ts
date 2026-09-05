import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CasePriority, CaseStatus } from '@prisma/client';
import { PaginationDto } from '../common/api/pagination.dto';

export class CreateCaseDto {
  @IsString()
  @MaxLength(255)
  caseNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  internalNumber?: string;

  @IsUUID(4)
  clientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  practiceArea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  caseType?: string;

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @IsOptional()
  @IsDateString()
  openDate?: string;

  @IsOptional()
  @IsDateString()
  closeDate?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  partyIds?: string[];
}

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  caseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  internalNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  practiceArea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  caseType?: string;

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @IsOptional()
  @IsDateString()
  openDate?: string;

  @IsOptional()
  @IsDateString()
  closeDate?: string;
}

export class AddCasePartyDto {
  @IsUUID(4)
  partyId!: string;

  @IsUUID(4)
  roleId!: string;
}

export class CaseQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;
}

export class AssignCaseMemberDto {
  @IsUUID(4)
  membershipId!: string;
}
