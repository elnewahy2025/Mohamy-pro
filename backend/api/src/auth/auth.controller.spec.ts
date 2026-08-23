import { AuthController } from './auth.controller';

function config() {
  const values = {
    FRONTEND_ORIGIN: 'http://localhost:5173',
    SESSION_COOKIE_NAME: 'mohamy_session',
    SESSION_ABSOLUTE_TTL_SECONDS: 43_200,
    SESSION_SECURE_COOKIE: false,
  };
  return {
    getOrThrow: jest.fn((key: keyof typeof values) => values[key]),
  } as never;
}

describe('AuthController', () => {
  it('redirects a successful callback to the configured frontend origin', async () => {
    const auth = {
      completeLogin: jest.fn(() => ({
        cookieValue: 'A'.repeat(43),
        returnTo: '/ar',
      })),
    } as never;
    const response = {
      append: jest.fn(),
      redirect: jest.fn(),
    } as never;
    const controller = new AuthController(auth, {} as never, config());

    await controller.callback('code', 'state', undefined, response);

    expect(response.append).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('mohamy_session='),
    );
    expect(response.redirect).toHaveBeenCalledWith(
      302,
      'http://localhost:5173/ar',
    );
  });
});
