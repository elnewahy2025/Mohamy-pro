import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateClientAddressDto {
  @ApiProperty({ enum: ['MAILING', 'BILLING', 'REGISTERED', 'BRANCH'] })
  @IsEnum(['MAILING', 'BILLING', 'REGISTERED', 'BRANCH'])
  type!: 'MAILING' | 'BILLING' | 'REGISTERED' | 'BRANCH';

  @ApiProperty({ maxLength: 300 })
  @IsString()
  line1!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  line2?: string | null;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  city!: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  region?: string | null;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  postalCode?: string | null;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  country!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateClientAddressDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  line1?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  line2?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  region?: string | null;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  postalCode?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class RemoveClientAddressDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  reason?: string;
}
