import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'principal-firm', description: 'Unique slug.' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug!: string;

  @ApiProperty({ example: 'Principal Firm LLP', description: 'Display name.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class UpdateOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ example: 'principal-firm', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ example: 'Principal Firm LLP', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class ArchiveOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
