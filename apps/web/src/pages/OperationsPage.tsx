import type { ReactElement } from 'react';
import { useLocale } from '../i18n/locale-context';

export function OperationsPage(): ReactElement {
  const { locale } = useLocale();
  const items = locale === 'ar'
    ? [
        ['01', 'الصحة والمراقبة', 'نقاط فحص جاهزية واضحة للخدمات الأساسية.'],
        ['02', 'المعالجة غير المتزامنة', 'طابور عمل مع إعادة محاولة تدريجية ورسائل مضمونة.'],
        ['03', 'سجل الأحداث', 'Outbox وIdempotency لمنع التكرار وفقدان الأحداث.'],
      ]
    : [
        ['01', 'Health and observability', 'Clear readiness checks for every required service.'],
        ['02', 'Asynchronous processing', 'A queue foundation with bounded retries and durable handoff.'],
        ['03', 'Event safety', 'Outbox and idempotency foundations to prevent duplication and loss.'],
      ];
  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{locale === 'ar' ? 'العمليات' : 'Operations'}</p>
        <h1>{locale === 'ar' ? 'أساس تشغيلي يمكن الوثوق به.' : 'An operational foundation you can trust.'}</h1>
        <p>{locale === 'ar' ? 'كل مكوّن أساسي له عقد واضح، حالة قابلة للفحص، ومسار آمن للتوسع.' : 'Every core capability has an explicit contract, a checkable state, and a safe path to scale.'}</p>
      </div>
      <div className="feature-list">
        {items.map(([number, title, description]) => (
          <article className="feature-row" key={number}>
            <span className="feature-number">{number}</span>
            <div><h2>{title}</h2><p>{description}</p></div>
            <span className="feature-arrow" aria-hidden="true">↗</span>
          </article>
        ))}
      </div>
    </section>
  );
}
