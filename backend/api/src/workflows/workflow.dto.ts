import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  caseType?: string;
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
  fromStateId?: string;

  @IsString()
  @IsNotEmpty()
  toStateId: string;

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
