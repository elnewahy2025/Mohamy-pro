import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  CalendarLocalType,
  CalendarProvider,
  ConflictResolution,
} from '@prisma/client';

export class CreateConnectionDto {
  @IsEnum(CalendarProvider)
  provider!: CalendarProvider;

  @IsString()
  @IsNotEmpty()
  accountRef!: string;
}

export class PushEventDto {
  @IsUUID()
  connectionId!: string;

  @IsEnum(CalendarLocalType)
  localType!: CalendarLocalType;

  @IsUUID()
  localId!: string;
}

export class PullChangesDto {
  @IsUUID()
  connectionId!: string;
}

export class ResolveConflictDto {
  @IsEnum(ConflictResolution)
  resolution!: ConflictResolution;
}

export class WebhookReceiptDto {
  @IsString()
  @IsOptional()
  externalId?: string;

  @IsEnum(CalendarLocalType)
  @IsOptional()
  localType?: CalendarLocalType;

  @IsUUID()
  @IsOptional()
  localId?: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
