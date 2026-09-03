import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  IsEmail,
} from 'class-validator';
import { DocumentStatus } from '@prisma/client';

export class CreateDocumentDto {
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  documentType?: string;

  @IsString()
  @IsNotEmpty()
  storageObjectId: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsInt()
  @Min(0)
  fileSize: number;

  @IsString()
  @IsOptional()
  checksum?: string;
}

export class UploadNewVersionDto {
  @IsString()
  @IsNotEmpty()
  storageObjectId: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsInt()
  @Min(0)
  fileSize: number;

  @IsString()
  @IsOptional()
  checksum?: string;
}

export class UpdateDocumentStatusDto {
  @IsEnum(DocumentStatus)
  @IsNotEmpty()
  status: DocumentStatus;
}

export class ShareDocumentDto {
  @IsEmail()
  @IsNotEmpty()
  sharedWithEmail: string;

  @IsString()
  @IsOptional()
  expiresAt?: string;
}
