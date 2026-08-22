import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from './session-cookie';

function config(secure = false) {
  return {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string | boolean | number> = {
        SESSION_COOKIE_NAME: 'mohamy_session',
        SESSION_ABSOLUTE_TTL_SECONDS: 43_200,
        SESSION_SECURE_COOKIE: secure,
      };
      return values[key];
    }),
  } as never;
}

describe('session-cookie', () => {
  it('reads a cookie value and rejects malformed encoding', () => {
    expect(
      readSessionCookie(
        'other=value; mohamy_session=opaque_value',
        'mohamy_session',
      ),
    ).toBe('opaque_value');
    expect(
      readSessionCookie('mohamy_session=%ZZ', 'mohamy_session'),
    ).toBeNull();
    expect(readSessionCookie(undefined, 'mohamy_session')).toBeNull();
  });

  it('sets an HttpOnly host-only SameSite cookie without exposing tokens', () => {
    const append = jest.fn();
    const response = { append } as never;
    setSessionCookie(response, 'opaque-value', config());
    expect(append).toHaveBeenCalledWith(
      'Set-Cookie',
      'mohamy_session=opaque-value; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200',
    );
  });

  it('adds Secure only when configured and clears the cookie safely', () => {
    const append = jest.fn();
    const response = { append } as never;
    const secureConfig = config(true);
    setSessionCookie(response, 'opaque-value', secureConfig);
    clearSessionCookie(response, secureConfig);

    expect(append).toHaveBeenNthCalledWith(
      1,
      'Set-Cookie',
      expect.stringContaining('; Secure'),
    );
    expect(append).toHaveBeenNthCalledWith(
      2,
      'Set-Cookie',
      expect.stringContaining('Max-Age=0'),
    );
    expect(append).toHaveBeenNthCalledWith(
      2,
      'Set-Cookie',
      expect.stringContaining('Expires=Thu, 01 Jan 1970 00:00:00 GMT'),
    );
    expect(append).toHaveBeenNthCalledWith(
      2,
      'Set-Cookie',
      expect.stringContaining('; Secure'),
    );
  });
});
