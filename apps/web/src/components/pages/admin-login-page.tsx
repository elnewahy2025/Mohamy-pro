'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/auth-provider';
import { Link } from '@/i18n/routing';

export function AdminLoginPage(): React.ReactNode {
  const t = useTranslations();
  const { user, isLoading, login } = useAuth();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('auth.adminLogin.eyebrow')}</p>
        <h1>{t('auth.adminLogin.title')}</h1>
        <p>{t('auth.adminLogin.description')}</p>
      </div>
      <div className="settings-card" aria-live="polite">
        {isLoading ? (
          <p>{t('auth.adminLogin.checking')}</p>
        ) : user ? (
          <>
            <p>
              <ShieldCheck aria-hidden="true" size={16} />{' '}
              {t('auth.adminLogin.authenticatedAs')}{' '}
              <code>{user.username ?? user.userId}</code>
            </p>
            <Link className="primary-button" href="/dashboard">
              {t('auth.adminLogin.continue')}
            </Link>
          </>
        ) : (
          <Button variant="default" onClick={login}>
            <ShieldCheck aria-hidden="true" size={16} />
            {t('auth.adminLogin.signIn')}
          </Button>
        )}
      </div>
    </section>
  );
}
