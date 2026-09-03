import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { CaseTimelineEventType } from '@prisma/client';
import { PaginationDto } from '../common/api/pagination.dto';

export class CaseTimelineQueryDto extends PaginationDto {}

export class CreateCaseTimelineEventDto {
  @IsEnum(CaseTimelineEventType)
  eventType!: CaseTimelineEventType;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}
