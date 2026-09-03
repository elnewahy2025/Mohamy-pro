import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateClientContactDto {
  @ApiProperty({ enum: ['PHONE', 'EMAIL', 'FAX', 'WEBSITE', 'MOBILE'] })
  @IsEnum(['PHONE', 'EMAIL', 'FAX', 'WEBSITE', 'MOBILE'])
  type!: 'PHONE' | 'EMAIL' | 'FAX' | 'WEBSITE' | 'MOBILE';

  @ApiProperty({ maxLength: 300 })
  @IsString()
  value!: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateClientContactDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class RemoveClientContactDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  reason?: string;
}
