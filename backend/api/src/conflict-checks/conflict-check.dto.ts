import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../common/api/pagination.dto';

export class ConflictPartyDto {
  @ApiProperty({ enum: ['PARTY', 'RELATED_ENTITY'] })
  @IsEnum(['PARTY', 'RELATED_ENTITY'])
  kind!: 'PARTY' | 'RELATED_ENTITY';

  @ApiProperty({
    example: 'Acme Corp',
    description: 'Party display name (prospective party or related entity).',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;

  @ApiPropertyOptional({
    maxLength: 300,
    description: 'Party email, used for deterministic match against contacts.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  email?: string | null;
}

export class CreateConflictCheckDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional client the check is being run for (must be in the active tenant).',
  })
  @IsOptional()
  @IsString()
  clientId?: string | null;

  @ApiProperty({
    description: 'Prospective parties / related entities to screen.',
    type: [ConflictPartyDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConflictPartyDto)
  parties!: ConflictPartyDto[];
}

export class ConflictCheckIdDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  id!: string;
}

export class StartConflictReviewDto {
  @ApiProperty({ format: 'uuid', description: 'The conflict check to review.' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Review note (audited).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class DecideConflictCheckDto {
  @ApiProperty({ format: 'uuid', description: 'The conflict check to decide.' })
  @IsString()
  id!: string;

  @ApiProperty({ enum: ['ALLOW', 'BLOCK'] })
  @IsEnum(['ALLOW', 'BLOCK'])
  decision!: 'ALLOW' | 'BLOCK';

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Reason for the decision (audited).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ListConflictCheckQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'IN_REVIEW', 'COMPLETED'] })
  @IsOptional()
  @IsEnum(['PENDING', 'IN_REVIEW', 'COMPLETED'])
  status?: 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
}
