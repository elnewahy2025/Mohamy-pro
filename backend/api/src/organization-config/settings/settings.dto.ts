import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

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
