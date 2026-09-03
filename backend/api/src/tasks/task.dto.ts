import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsEnum,
  IsObject,
} from 'class-validator';
import { TaskStatus, TaskPriority } from '@prisma/client';

export class CreateTaskDto {
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsUUID()
  @IsOptional()
  assignedUserId?: string;

  @IsUUID()
  @IsOptional()
  parentTaskId?: string;

  @IsObject()
  @IsOptional()
  recurringRule?: Record<string, any>;

  @IsObject()
  @IsOptional()
  sla?: Record<string, any>;

  @IsObject()
  @IsOptional()
  escalationRule?: Record<string, any>;
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  @IsNotEmpty()
  status: TaskStatus;
}

export class AssignTaskDto {
  @IsUUID()
  @IsNotEmpty()
  assignedUserId: string;
}
