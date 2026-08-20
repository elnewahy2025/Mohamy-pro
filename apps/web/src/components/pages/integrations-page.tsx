import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

const services = [
  ['PostgreSQL', 'postgres'],
  ['Redis', 'redis'],
  ['MinIO', 'minio'],
] as const;

export function IntegrationsPage(): React.ReactNode {
  const t = useTranslations();
  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('integrations.eyebrow')}</p>
        <h1>{t('integrations.title')}</h1>
        <p>{t('integrations.description')}</p>
      </div>
      <div className="service-table" role="table" aria-label={t('integrations.tableLabel')}>
        <div className="service-table-header" role="row">
          <span>{t('integrations.headers.service')}</span>
          <span>{t('integrations.headers.role')}</span>
          <span>{t('integrations.headers.status')}</span>
          <span>{t('integrations.headers.port')}</span>
        </div>
        {services.map(([name, key]) => (
          <div className="service-table-row" role="row" key={name}>
            <strong>{name}</strong>
            <span>{t(`integrations.services.${key}.role`)}</span>
            <span className="service-status"><i />{t(`integrations.services.${key}.status`)}</span>
            <code>{t(`integrations.services.${key}.port`)}</code>
          </div>
        ))}
      </div>
      <p className="security-note"><ShieldCheck aria-hidden="true" size={16} />{t('common.secureDocuments')}</p>
    </section>
  );
}
