import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
} from '@prisma/client';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateRuleDto {
  @IsEnum(NotificationEvent)
  eventType!: NotificationEvent;

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels!: NotificationChannel[];

  @IsEnum(NotificationAudience)
  @IsOptional()
  audience?: NotificationAudience;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  escalationHours?: number;

  @IsUUID()
  @IsOptional()
  escalateToMembershipId?: string;
}

export class UpdateRuleDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  escalationHours?: number;
}

export class SetPreferenceDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Matches(HHMM)
  @IsOptional()
  quietStart?: string;

  @IsString()
  @Matches(HHMM)
  @IsOptional()
  quietEnd?: string;
}
