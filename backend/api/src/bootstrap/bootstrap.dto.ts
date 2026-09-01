import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class BootstrapDto {
  @ApiProperty({
    description:
      'Server-issued bootstrap secret authorizing first-tenant creation.',
    minLength: 1,
    example: 'bootstrap-secret-value',
  })
  @IsString()
  @MinLength(1)
  secret!: string;
}
