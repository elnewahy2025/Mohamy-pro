import { SetMetadata } from '@nestjs/common';
import type { PolicyName } from './authorization.types';

export const AUTHORIZATION_POLICY_METADATA = 'mohamy.authorization.policy';

export const RequirePolicy = (
  policy: PolicyName,
): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHORIZATION_POLICY_METADATA, policy);
