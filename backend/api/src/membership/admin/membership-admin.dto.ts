import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class MembershipAdminDto {
  @ApiProperty({ description: 'The membership to administer.', format: 'uuid' })
  @IsUUID()
  membershipId!: string;

  @ApiProperty({
    description: 'Administrative reason for the action.',
    required: false,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiProperty({
    description: 'Optional effective activation boundary.',
    required: false,
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  activeUntil?: string;
}

export class MembershipReinstateDto {
  @ApiProperty({ description: 'The membership to reinstate.', format: 'uuid' })
  @IsUUID()
  membershipId!: string;

  @ApiProperty({
    description: 'Activation boundary from which the membership resumes.',
    required: false,
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  activeFrom?: string;

  @ApiProperty({
    description: 'Activation boundary until which the membership runs.',
    required: false,
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  activeUntil?: string;

  @ApiProperty({
    description: 'Administrative reason for reinstatement.',
    required: false,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
