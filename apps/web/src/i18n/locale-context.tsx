import { createContext, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { translations, type Locale, type TranslationSet } from './translations';

interface LocaleContextValue {
  locale: Locale;
  copy: TranslationSet;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = 'mohamy.locale';

function initialLocale(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'ar' ? 'ar' : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }): ReactElement {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const copy = translations[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = copy.direction;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [copy.direction, locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    copy,
    setLocale: setLocaleState,
  }), [copy, locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used inside LocaleProvider');
  }
  return context;
}
