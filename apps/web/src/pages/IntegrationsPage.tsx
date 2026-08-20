import type { ReactElement } from 'react';
import { useLocale } from '../i18n/locale-context';

export function IntegrationsPage(): ReactElement {
  const { locale } = useLocale();
  const services = locale === 'ar'
    ? [
        ['PostgreSQL', 'قاعدة البيانات الأساسية', 'جاهز', '55432'],
        ['Redis', 'التخزين المؤقت والطوابير', 'جاهز', '56379'],
        ['MinIO', 'تخزين كائنات خاص', 'جاهز', '59000'],
      ]
    : [
        ['PostgreSQL', 'Primary relational data', 'Ready', '55432'],
        ['Redis', 'Cache and queue transport', 'Ready', '56379'],
        ['MinIO', 'Private object storage', 'Ready', '59000'],
      ];
  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{locale === 'ar' ? 'التكاملات' : 'Integrations'}</p>
        <h1>{locale === 'ar' ? 'الخدمات تعمل ضمن حدود واضحة.' : 'Services with clear boundaries.'}</h1>
        <p>{locale === 'ar' ? 'التكاملات تمر عبر طبقات مستقلة، مع إبقاء الأسرار والروابط الخاصة خارج الواجهة.' : 'Integrations pass through independent layers, keeping secrets and private links outside the client.'}</p>
      </div>
      <div className="service-table" role="table" aria-label={locale === 'ar' ? 'حالة الخدمات' : 'Service status'}>
        <div className="service-table-header" role="row"><span>Service</span><span>Role</span><span>Status</span><span>Port</span></div>
        {services.map(([name, role, status, port]) => (
          <div className="service-table-row" role="row" key={name}>
            <strong>{name}</strong><span>{role}</span><span className="service-status"><i />{status}</span><code>{port}</code>
          </div>
        ))}
      </div>
      <p className="security-note"><span aria-hidden="true">◈</span>{locale === 'ar' ? 'لا تُعرض المستندات القانونية عبر روابط عامة.' : 'Legal documents are never exposed through public URLs.'}</p>
    </section>
  );
}
