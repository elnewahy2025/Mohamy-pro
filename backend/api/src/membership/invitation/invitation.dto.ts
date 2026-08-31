import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class InvitationCreateDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  intendedEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  intendedProviderSubject?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  requestedRoleKeys!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InvitationScopeDto)
  requestedScope?: InvitationScopeDto | null;
}

export class InvitationScopeDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}

export class InvitationAcceptDto {
  @IsString()
  @MaxLength(4096)
  token!: string;
}
