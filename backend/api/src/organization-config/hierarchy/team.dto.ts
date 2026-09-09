import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: 'mergers', description: 'Unique slug.' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug!: string;

  @ApiProperty({
    example: 'Mergers & Acquisitions',
    description: 'Display name.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ format: 'uuid', description: 'Parent department.' })
  @IsUUID()
  departmentId!: string;
}

export class UpdateTeamDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
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

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Parent department.' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class ArchiveTeamDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
