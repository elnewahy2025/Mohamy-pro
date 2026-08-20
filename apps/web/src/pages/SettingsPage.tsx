import type { ReactElement } from 'react';
import { useLocale } from '../i18n/locale-context';

export function SettingsPage(): ReactElement {
  const { locale, copy, setLocale } = useLocale();
  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{copy.navigation.settings}</p>
        <h1>{locale === 'ar' ? 'اللغة جزء من الأساس.' : 'Language belongs in the foundation.'}</h1>
        <p>{locale === 'ar' ? 'يمكن تبديل اللغة والاتجاه من اليوم الأول دون تغيير مسارات التنقل أو قابلية الوصول.' : 'Language and direction can change from day one without changing navigation or accessibility behavior.'}</p>
      </div>
      <div className="settings-card">
        <div className="settings-card-heading"><span className="settings-icon" aria-hidden="true">文</span><div><h2>{copy.common.language}</h2><p>{locale === 'ar' ? 'اختر لغة الواجهة المفضلة.' : 'Choose your preferred interface language.'}</p></div></div>
        <div className="settings-options" role="group" aria-label={copy.common.language}>
          <button type="button" className={locale === 'en' ? 'setting-option is-selected' : 'setting-option'} onClick={() => setLocale('en')} aria-pressed={locale === 'en'}><strong>English</strong><span>LTR</span></button>
          <button type="button" className={locale === 'ar' ? 'setting-option is-selected' : 'setting-option'} onClick={() => setLocale('ar')} aria-pressed={locale === 'ar'}><strong>العربية</strong><span>RTL</span></button>
        </div>
      </div>
      <div className="accessibility-note"><span className="note-icon" aria-hidden="true">✓</span><div><strong>{locale === 'ar' ? 'قابلية الوصول مفعلة' : 'Accessibility is part of the default'}</strong><p>{locale === 'ar' ? 'التنقل بلوحة المفاتيح، التسميات الدلالية، وتباين الألوان مدعومة في هذه الواجهة.' : 'Keyboard navigation, semantic labels, and contrast-aware colors are supported by this shell.'}</p></div></div>
    </section>
  );
}
