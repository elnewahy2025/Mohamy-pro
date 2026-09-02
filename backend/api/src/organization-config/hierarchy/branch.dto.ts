import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ format: 'uuid', description: 'Parent organization.' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ example: 'cairo', description: 'Unique slug.' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug!: string;

  @ApiProperty({ example: 'Cairo Office', description: 'Display name.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class UpdateBranchDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class ArchiveBranchDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
