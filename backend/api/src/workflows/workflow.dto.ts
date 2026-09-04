import { HierarchyStatus } from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  caseType?: string;

  @IsEnum(HierarchyStatus)
  @IsOptional()
  status?: HierarchyStatus;
}

export class CreateWorkflowStateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  isInitial?: boolean;

  @IsBoolean()
  @IsOptional()
  isFinal?: boolean;
}

export class CreateWorkflowTransitionDto {
  @IsString()
  @IsOptional()
  fromStateName?: string;

  @IsString()
  @IsNotEmpty()
  toStateName: string;

  @IsObject()
  @IsOptional()
  conditions?: Record<string, any>;

  @IsObject()
  @IsOptional()
  actions?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;
}

export class CreateWorkflowVersionDto {
  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowStateDto)
  states: CreateWorkflowStateDto[];

  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowTransitionDto)
  transitions: CreateWorkflowTransitionDto[];
}
