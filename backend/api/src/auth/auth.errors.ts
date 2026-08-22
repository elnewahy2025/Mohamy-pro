import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';

export class AuthenticationError extends UnauthorizedException {
  constructor(code = 'AUTHENTICATION_REQUIRED') {
    super(code);
  }
}

export class CsrfError extends ForbiddenException {
  constructor(code = 'CSRF_INVALID') {
    super(code);
  }
}

export class OriginError extends ForbiddenException {
  constructor() {
    super('ORIGIN_NOT_ALLOWED');
  }
}

export class ProviderUnavailableError extends HttpException {
  constructor() {
    super(
      'AUTHENTICATION_PROVIDER_UNAVAILABLE',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
