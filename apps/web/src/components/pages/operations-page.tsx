import { useTranslations } from 'next-intl';

const items = [
  ['01', 'health'],
  ['02', 'async'],
  ['03', 'events'],
] as const;

export function OperationsPage(): React.ReactNode {
  const t = useTranslations();
  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('operations.eyebrow')}</p>
        <h1>{t('operations.title')}</h1>
        <p>{t('operations.description')}</p>
      </div>
      <div className="feature-list">
        {items.map(([number, key]) => (
          <article className="feature-row" key={number}>
            <span className="feature-number">{number}</span>
            <div>
              <h2>{t(`operations.items.${key}.title`)}</h2>
              <p>{t(`operations.items.${key}.description`)}</p>
            </div>
            <span className="feature-arrow" aria-hidden="true">↗</span>
          </article>
        ))}
      </div>
    </section>
  );
}
