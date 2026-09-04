import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { DocumentSecureLinkSection } from '@/components/pages/documents/document-secure-link-section';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale });
  return {
    title: `${t('documents.secureLinks.title')} - ${t('brand')}`,
  };
}

export default function SecureLinksPage() {
  const t = useTranslations();

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('documents.eyebrow')}</p>
        <h1>{t('documents.secureLinks.title')}</h1>
        <p>{t('documents.secureLinks.description')}</p>
      </div>

      <div className="tab-content">
        <DocumentSecureLinkSection />
      </div>
    </section>
  );
}
