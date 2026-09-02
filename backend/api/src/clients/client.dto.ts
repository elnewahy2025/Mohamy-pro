import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../common/api/pagination.dto';

export class CreateClientDto {
  @ApiProperty({ enum: ['INDIVIDUAL', 'ORGANIZATION'] })
  @IsEnum(['INDIVIDUAL', 'ORGANIZATION'])
  clientType!: 'INDIVIDUAL' | 'ORGANIZATION';

  @ApiProperty({
    example: 'Ahmed Hassan',
    description: 'Individual name or organization trading name.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Organization legal name (organizations).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string | null;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Referral/source label (free-form catalog key).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Internal notes.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateClientDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string | null;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ArchiveClientDto {
  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Archive reason (audited).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ClientIdDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  id!: string;
}

export class ListClientQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Free-text search over display name, name, and legal name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ARCHIVED';

  @ApiPropertyOptional({ enum: ['INDIVIDUAL', 'ORGANIZATION'] })
  @IsOptional()
  @IsEnum(['INDIVIDUAL', 'ORGANIZATION'])
  clientType?: 'INDIVIDUAL' | 'ORGANIZATION';
}
