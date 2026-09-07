import { ApiError } from '../common/api/api-error';

/**
 * Non-enumerating denial for provisioning operations. All reasons surface an
 * identical message so an observer cannot distinguish which condition applied.
 */
export class ProvisioningDeniedError extends ApiError {
  constructor(internalReason: string, status = 403) {
    super({
      status,
      code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
      message:
        status === 401
          ? 'Authentication is required.'
          : 'User provisioning is not available.',
    });
    this.name = 'ProvisioningDeniedError';
    this.internalReason = internalReason;
  }

  readonly internalReason: string;
}

export class ProvisioningUnavailableError extends ApiError {
  constructor(message = 'User provisioning is not configured') {
    super({ status: 503, code: 'SERVICE_UNAVAILABLE', message });
    this.name = 'ProvisioningUnavailableError';
  }
}

export class ProvisioningFailedError extends ApiError {
  constructor(message = 'Identity provider request failed') {
    super({ status: 502, code: 'SERVICE_UNAVAILABLE', message });
    this.name = 'ProvisioningFailedError';
  }
}
