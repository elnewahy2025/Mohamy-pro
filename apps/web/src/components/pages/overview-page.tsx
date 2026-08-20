import { ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export function OverviewPage(): React.ReactNode {
  const t = useTranslations();

  return (
    <section className="page-section overview-page">
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">{t('overview.eyebrow')}</p>
          <h1>{t('overview.title')}</h1>
          <p className="hero-description">{t('overview.description')}</p>
          <div className="hero-actions">
            <Link className="primary-button" href="/integrations">
              {t('overview.viewHealth')}
              <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </div>
        <div className="hero-visual" aria-label={t('overview.visualLabel')} role="img">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="visual-grid" />
          <div className="visual-card visual-card-main">
            <span className="visual-card-label">{t('overview.visualSystem')}</span>
            <strong>{t('overview.visualTitle')}</strong>
            <span className="visual-card-line"><i /> {t('overview.databaseOnline')}</span>
            <span className="visual-card-line"><i /> {t('overview.queueReady')}</span>
          </div>
          <div className="visual-card visual-card-mini">09:41<br /><span>{t('overview.timezone')}</span></div>
        </div>
      </div>
      <div className="metrics-grid">
        <article className="metric-card metric-card-accent">
          <div className="metric-card-top"><span>{t('overview.statusLabel')}</span><span className="status-dot" /></div>
          <strong>{t('overview.statusValue')}</strong>
          <small>{t('overview.statusDetail')}</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>{t('overview.apiLabel')}</span><span className="metric-arrow">↗</span></div>
          <strong>{t('overview.apiValue')}</strong>
          <small>{t('overview.apiDetail')}</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>{t('overview.dataLabel')}</span><span className="metric-arrow">↗</span></div>
          <strong>{t('overview.dataValue')}</strong>
          <small>{t('overview.dataDetail')}</small>
        </article>
      </div>
      <article className="next-step-card">
        <div>
          <p className="eyebrow">{t('overview.roadmap')}</p>
          <h2>{t('overview.nextStepTitle')}</h2>
          <p>{t('overview.nextStepBody')}</p>
        </div>
        <span className="next-step-number" aria-hidden="true">{t('overview.nextStepNumber')}</span>
      </article>
    </section>
  );
}
