import { cookies } from 'next/headers';
import { type AuthUser, type SuccessEnvelope } from './api';

export async function getServerSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'mohamy_session';
  const sessionCookie = cookieStore.get(sessionCookieName);

  if (!sessionCookie) {
    return null;
  }

  const apiUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000';
  
  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
      headers: {
        Cookie: `${sessionCookieName}=${sessionCookie.value}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return null;
    }

    const envelope = (await res.json()) as SuccessEnvelope<AuthUser>;
    return envelope.data ?? null;
  } catch (e) {
    console.error('Failed to fetch server session:', e);
    return null;
  }
}
