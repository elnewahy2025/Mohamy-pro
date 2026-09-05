import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  CommunicationChannel,
  ConsentStatus,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';

export class CreateThreadDto {
  @IsString()
  @IsOptional()
  subject?: string;

  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  @IsOptional()
  taskId?: string;
}

export class CreateMessageDto {
  @IsUUID()
  @IsOptional()
  threadId?: string;

  @IsEnum(CommunicationChannel)
  channel!: CommunicationChannel;

  @IsEnum(MessageDirection)
  direction!: MessageDirection;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  @IsOptional()
  taskId?: string;
}

export class RecordMessageStatusDto {
  @IsEnum(MessageStatus)
  status!: MessageStatus;

  @IsString()
  @IsOptional()
  error?: string;
}

export class AddAttachmentDto {
  @IsUUID()
  storageObjectId!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  @Min(0)
  fileSize!: number;
}

export class SetConsentDto {
  @IsUUID()
  clientId!: string;

  @IsEnum(CommunicationChannel)
  channel!: CommunicationChannel;

  @IsEnum(ConsentStatus)
  status!: ConsentStatus;
}
