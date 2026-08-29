import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './session/csrf.guard';
import { SessionGuard } from './session/session.guard';

jest.mock('./auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({})),
}));

function guardsFor(methodName: 'logout' | 'me' | 'csrf'): Array<unknown> {
  const descriptor = Object.getOwnPropertyDescriptor(
    AuthController.prototype,
    methodName,
  );
  const method =
    descriptor?.value ?? (AuthController.prototype as never)[methodName];
  return (Reflect.getMetadata(GUARDS_METADATA, method) as Array<unknown>) ?? [];
}

describe('AuthController guard wiring', () => {
  let controller: AuthController;

  beforeEach(() => {
    controller = new AuthController({} as AuthService);
  });

  it('is instantiable', () => {
    expect(controller).toBeDefined();
  });

  it('protects POST /logout with SessionGuard and CsrfGuard', () => {
    expect(guardsFor('logout')).toContain(SessionGuard);
    expect(guardsFor('logout')).toContain(CsrfGuard);
  });

  it('protects GET /me with SessionGuard', () => {
    expect(guardsFor('me')).toContain(SessionGuard);
  });

  it('protects GET /csrf with SessionGuard and CsrfGuard', () => {
    expect(guardsFor('csrf')).toContain(SessionGuard);
    expect(guardsFor('csrf')).toContain(CsrfGuard);
  });
});
