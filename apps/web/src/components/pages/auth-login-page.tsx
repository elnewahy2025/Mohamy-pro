// Sign-in / sign-out landing page, also the post-logout and OIDC callback
// target. Sole responsibility: render session state and the login/logout action.

'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/auth-provider';

export function AuthLoginPage(): React.ReactNode {
  const t = useTranslations();
  const { user, isLoading, login, logout } = useAuth();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('auth.login.eyebrow')}</p>
        <h1>{t('auth.login.title')}</h1>
        <p>{t('auth.login.description')}</p>
      </div>
      <div className="settings-card" aria-live="polite">
        {isLoading ? (
          <p>{t('auth.login.checking')}</p>
        ) : user ? (
          <>
            <p>
              {t('auth.login.authenticatedAs')}{' '}
              <code>{user.userId}</code>
            </p>
            <Button variant="default" onClick={() => void logout()}>
              {t('common.signOut')}
            </Button>
          </>
        ) : (
          <>
            <p>{t('auth.login.notAuthenticated')}</p>
            <Button variant="default" onClick={login}>
              {t('common.signIn')}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
