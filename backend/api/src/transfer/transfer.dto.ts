import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { TransferEntity, TransferFormat } from '@prisma/client';

export class CreateImportDto {
  @IsEnum(TransferEntity)
  entityType!: TransferEntity;

  @IsEnum(TransferFormat)
  @IsOptional()
  format?: TransferFormat;

  @IsUUID()
  @IsOptional()
  storageObjectId?: string;

  @IsString()
  @MaxLength(262144)
  @IsOptional()
  content?: string;

  @IsObject()
  @IsOptional()
  mapping?: Record<string, string>;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}

export class ApproveImportDto {
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class CreateExportDto {
  @IsEnum(TransferEntity)
  entityType!: TransferEntity;

  @IsEnum(TransferFormat)
  @IsOptional()
  format?: TransferFormat;

  @IsObject()
  @IsOptional()
  filters?: Record<string, string>;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxRows?: number;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}
