'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Languages, Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePathname, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

const languageSchema = z.object({
  locale: z.enum(['en', 'ar']),
});
type LanguageForm = z.infer<typeof languageSchema>;

export function SettingsPage(): React.ReactNode {
  const locale = useLocale() as LanguageForm['locale'];
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { register, setValue } = useForm<LanguageForm>({
    resolver: zodResolver(languageSchema),
    defaultValues: { locale },
  });

  function changeLocale(nextLocale: LanguageForm['locale']): void {
    setValue('locale', nextLocale, { shouldValidate: true });
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('settings.eyebrow')}</p>
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.description')}</p>
      </div>
      <form className="settings-card" aria-label={t('common.language')}>
        <div className="settings-card-heading">
          <span className="settings-icon" aria-hidden="true"><Languages size={18} /></span>
          <div><h2>{t('common.language')}</h2><p>{t('settings.chooseLanguage')}</p></div>
        </div>
        <input type="hidden" {...register('locale')} />
        <div className="settings-options" role="group" aria-label={t('common.language')}>
          <Button
            className={`setting-option${locale === 'en' ? ' is-selected' : ''}`}
            variant="ghost"
            onClick={() => changeLocale('en')}
            aria-pressed={locale === 'en'}
          >
            <strong>{t('settings.english')}</strong><span>{t('settings.ltr')}</span>
          </Button>
          <Button
            className={`setting-option${locale === 'ar' ? ' is-selected' : ''}`}
            variant="ghost"
            onClick={() => changeLocale('ar')}
            aria-pressed={locale === 'ar'}
          >
            <strong>{t('settings.arabic')}</strong><span>{t('settings.rtl')}</span>
          </Button>
        </div>
      </form>
      <div className="accessibility-note">
        <span className="note-icon" aria-hidden="true"><Check size={14} /></span>
        <div><strong>{t('settings.accessibilityTitle')}</strong><p>{t('settings.accessibilityBody')}</p></div>
      </div>
    </section>
  );
}
