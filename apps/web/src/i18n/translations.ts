export type Locale = 'en' | 'ar';

export interface TranslationSet {
  languageName: string;
  direction: 'ltr' | 'rtl';
  brand: string;
  productTagline: string;
  navigation: {
    overview: string;
    operations: string;
    integrations: string;
    settings: string;
  };
  overview: {
    eyebrow: string;
    title: string;
    description: string;
    statusLabel: string;
    statusValue: string;
    nextStepTitle: string;
    nextStepBody: string;
    viewHealth: string;
  };
  common: {
    language: string;
    menu: string;
    close: string;
  };
}

export const translations: Record<Locale, TranslationSet> = {
  en: {
    languageName: 'English',
    direction: 'ltr',
    brand: 'Mohamy Pro',
    productTagline: 'Legal operations, with clarity.',
    navigation: {
      overview: 'Overview',
      operations: 'Operations',
      integrations: 'Integrations',
      settings: 'Settings',
    },
    overview: {
      eyebrow: 'Phase 1 foundation',
      title: 'A calm command center for legal work.',
      description: 'The platform foundation is ready for secure, observable legal operations across teams and organizations.',
      statusLabel: 'Foundation status',
      statusValue: 'Operational',
      nextStepTitle: 'Next build focus',
      nextStepBody: 'Identity and multi-tenancy will establish secure membership boundaries before business workflows are introduced.',
      viewHealth: 'Open system health',
    },
    common: {
      language: 'Language',
      menu: 'Open navigation menu',
      close: 'Close navigation menu',
    },
  },
  ar: {
    languageName: 'العربية',
    direction: 'rtl',
    brand: 'محامي برو',
    productTagline: 'إدارة قانونية بوضوح.',
    navigation: {
      overview: 'نظرة عامة',
      operations: 'العمليات',
      integrations: 'التكاملات',
      settings: 'الإعدادات',
    },
    overview: {
      eyebrow: 'أساس المرحلة الأولى',
      title: 'مركز قيادة هادئ للعمل القانوني.',
      description: 'أصبح أساس المنصة جاهزاً لعمليات قانونية آمنة وقابلة للمراقبة عبر الفرق والمؤسسات.',
      statusLabel: 'حالة الأساس',
      statusValue: 'يعمل بكفاءة',
      nextStepTitle: 'محور البناء التالي',
      nextStepBody: 'ستؤسس الهوية وتعدد المؤسسات لحدود عضوية آمنة قبل إضافة مسارات العمل التجارية.',
      viewHealth: 'فتح حالة النظام',
    },
    common: {
      language: 'اللغة',
      menu: 'فتح قائمة التنقل',
      close: 'إغلاق قائمة التنقل',
    },
  },
};
