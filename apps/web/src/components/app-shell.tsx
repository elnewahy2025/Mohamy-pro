'use client';

import { useEffect, useState } from 'react';
import { Menu, X, LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/auth-provider';
import { Sidebar } from '@/components/navigation/sidebar';

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  const locale = useLocale();
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, login, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 959px)');
    const onChange = (event: MediaQueryListEvent): void => setIsMobile(event.matches);
    setIsMobile(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  function switchLocale(nextLocale: 'en' | 'ar'): void {
    router.replace(pathname, { locale: nextLocale });
  }

  function closeMenu(): void {
    setMenuOpen(false);
  }

  const sidebarHidden = isMobile && !menuOpen;

  return (
    <div className="app-shell">
      <aside
        className={`sidebar-shell${menuOpen ? ' is-open' : ''}`}
        {...(sidebarHidden ? { inert: true } : {})}
        {...(sidebarHidden ? { 'aria-hidden': true } : {})}
      >
        <Sidebar onNavigate={closeMenu} />
      </aside>
      {menuOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label={t('common.close')}
          onClick={closeMenu}
        />
      ) : null}
      <div className="app-main">
        <header className="topbar">
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
          <Link className="brand" href="/" onClick={closeMenu} aria-label={t('brand')}>
            <span className="brand-mark" aria-hidden="true">M</span>
            <span>
              <strong>{t('brand')}</strong>
              <small>{t('productTagline')}</small>
            </span>
          </Link>
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
    </div>
  );
}
