import { useState, type ReactElement, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useLocale } from '../i18n/locale-context';

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const { locale, copy, setLocale } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = [
    { to: '/', label: copy.navigation.overview },
    { to: '/operations', label: copy.navigation.operations },
    { to: '/integrations', label: copy.navigation.integrations },
    { to: '/settings', label: copy.navigation.settings },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" onClick={() => setMenuOpen(false)} aria-label={copy.brand}>
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>
            <strong>{copy.brand}</strong>
            <small>{copy.productTagline}</small>
          </span>
        </Link>
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? copy.common.close : copy.common.menu}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
        </button>
        <nav className={`primary-nav${menuOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => isActive ? 'nav-link is-active' : 'nav-link'}
              onClick={() => setMenuOpen(false)}
              end={item.to === '/'}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-actions">
          <span className="language-label">{copy.common.language}</span>
          <div className="language-switcher" role="group" aria-label={copy.common.language}>
            <button type="button" className={locale === 'en' ? 'language-button is-selected' : 'language-button'} onClick={() => setLocale('en')} aria-pressed={locale === 'en'}>EN</button>
            <button type="button" className={locale === 'ar' ? 'language-button is-selected' : 'language-button'} onClick={() => setLocale('ar')} aria-pressed={locale === 'ar'}>ع</button>
          </div>
          <div className="profile-chip" aria-label="Current workspace">A</div>
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}
