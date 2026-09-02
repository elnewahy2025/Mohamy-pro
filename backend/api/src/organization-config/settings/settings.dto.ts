import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsOptional, Max, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for a settings write. The namespaced key is carried on the route path
 * (PUT /organization-config/settings/:key); the body carries only the value.
 */
export class SetOrganizationSettingValueDto {
  @ApiProperty({
    description:
      'Structured value to persist for the key. Any JSON-serializable value.',
  })
  @IsDefined({ message: 'value is required' })
  value!: unknown;
}

/**
 * Query for the settings list endpoint. Bounded by the same exfiltration cap
 * used by PaginationDto (max 100).
 */
export class ListOrganizationSettingQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
