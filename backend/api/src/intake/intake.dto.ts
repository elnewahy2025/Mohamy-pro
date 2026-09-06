import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ClientType } from '@prisma/client';

export class CreateIntakeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName!: string;

  @IsEnum(ClientType)
  clientType!: ClientType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  matterSummary!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  source?: string;

  @IsUUID()
  @IsOptional()
  conflictCheckId?: string;
}

export class ReviewIntakeDto {
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  reviewNotes?: string;
}

export class ApproveIntakeDto {
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  reviewNotes?: string;
}

export class RejectIntakeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
