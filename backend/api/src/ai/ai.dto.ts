import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const TASK_TYPES = [
  'DOCUMENT_SUMMARY',
  'CASE_BRIEF',
  'DEADLINE_DIGEST',
  'INTAKE_TRIAGE',
  'HEARING_PREP',
] as const;

export const REF_KINDS = ['CASE', 'DOCUMENT', 'INTAKE', 'DEADLINE'] as const;

export class AiRefDto {
  @IsIn([...REF_KINDS])
  kind!: string;

  @IsUUID()
  id!: string;
}

export class CreateAiRequestDto {
  @IsIn([...TASK_TYPES])
  taskType!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AiRefDto)
  refs!: AiRefDto[];

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  promptHint?: string;
}

export class ReviewAiRequestDto {
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  reviewNotes?: string;
}

export class RejectAiRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}

export interface ValidatedRef {
  kind: string;
  id: string;
}
