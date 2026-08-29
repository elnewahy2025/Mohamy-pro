'use client';

import { useState } from 'react';
import { Menu, X, LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/auth-provider';

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  const locale = useLocale();
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, login, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = [
    { href: '/', label: t('navigation.overview') },
    { href: '/operations', label: t('navigation.operations') },
    { href: '/integrations', label: t('navigation.integrations') },
    { href: '/settings', label: t('navigation.settings') },
  ] as const;

  function switchLocale(nextLocale: 'en' | 'ar'): void {
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" onClick={() => setMenuOpen(false)} aria-label={t('brand')}>
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>
            <strong>{t('brand')}</strong>
            <small>{t('productTagline')}</small>
          </span>
        </Link>
        <Button
          className="menu-toggle"
          variant="ghost"
          size="icon"
          aria-label={menuOpen ? t('common.close') : t('common.menu')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
        <nav className={`primary-nav${menuOpen ? ' is-open' : ''}`} aria-label={t('common.primaryNavigation')}>
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${isActive ? ' is-active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="topbar-actions">
          <span className="language-label">{t('common.language')}</span>
          <div className="language-switcher" role="group" aria-label={t('common.language')}>
            <Button
              className={`language-button${locale === 'en' ? ' is-selected' : ''}`}
              variant="ghost"
              size="sm"
              onClick={() => switchLocale('en')}
              aria-pressed={locale === 'en'}
            >
              EN
            </Button>
            <Button
              className={`language-button${locale === 'ar' ? ' is-selected' : ''}`}
              variant="ghost"
              size="sm"
              onClick={() => switchLocale('ar')}
              aria-pressed={locale === 'ar'}
            >
              ع
            </Button>
          </div>
          <div className="profile-actions">
            {isLoading ? (
              <span className="profile-chip" aria-hidden="true">…</span>
            ) : user ? (
              <>
                <span className="profile-chip" aria-label={t('common.authenticatedAs')}>
                  {user.userId.slice(0, 1).toUpperCase()}
                </span>
                <span className="profile-name">{user.username ?? user.userId}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="sign-out-button"
                  onClick={() => void logout()}
                  aria-label={t('common.signOut')}
                >
                  <LogOut aria-hidden="true" size={14} />
                  {t('common.signOut')}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="sign-in-button"
                onClick={login}
                aria-label={t('common.signIn')}
              >
                {t('common.signIn')}
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}
