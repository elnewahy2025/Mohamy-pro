import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'Intended recipient email address.',
    required: false,
    format: 'email',
    maxLength: 320,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  intendedEmail?: string;

  @ApiProperty({
    description: 'Intended recipient provider subject (external identity).',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  intendedProviderSubject?: string;

  @ApiProperty({
    description: 'Role keys the tenant intends to grant to the invitee.',
    type: [String],
    maxItems: 20,
    example: ['tenant.admin'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  requestedRoleKeys!: string[];

  @ApiProperty({
    description: 'Hierarchy scope to apply to the invited membership.',
    required: false,
    nullable: true,
    type: () => InvitationScopeDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvitationScopeDto)
  requestedScope?: InvitationScopeDto | null;
}

export class InvitationScopeDto {
  @ApiProperty({
    description: 'Organization the membership is scoped to.',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiProperty({
    description: 'Branch the membership is scoped to.',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({
    description: 'Department the membership is scoped to.',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({
    description: 'Team the membership is scoped to.',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

export class InvitationAcceptDto {
  @ApiProperty({
    description: 'Shareable invitation acceptance token.',
    maxLength: 4096,
  })
  @IsString()
  @MaxLength(4096)
  token!: string;
}
