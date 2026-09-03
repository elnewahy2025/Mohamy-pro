import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsEnum,
  IsObject,
} from 'class-validator';
import { DeadlineType, DeadlineStatus } from '@prisma/client';

export class CreateDeadlineRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsNotEmpty()
  effectiveFrom: string;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @IsObject()
  @IsOptional()
  reminderRule?: Record<string, any>;

  @IsObject()
  @IsOptional()
  escalationRule?: Record<string, any>;
}

export class CreateDeadlineDto {
  @IsUUID()
  @IsNotEmpty()
  caseId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DeadlineType)
  @IsNotEmpty()
  deadlineType: DeadlineType;

  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @IsUUID()
  @IsOptional()
  ruleId?: string;

  @IsUUID()
  @IsOptional()
  assignedUserId?: string;
}

export class CompleteDeadlineDto {
  @IsString()
  @IsOptional()
  completionEvidence?: string;
}
