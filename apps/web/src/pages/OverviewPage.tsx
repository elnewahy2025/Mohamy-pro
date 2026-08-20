import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/locale-context';

export function OverviewPage(): ReactElement {
  const { copy } = useLocale();
  return (
    <section className="page-section overview-page">
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">{copy.overview.eyebrow}</p>
          <h1>{copy.overview.title}</h1>
          <p className="hero-description">{copy.overview.description}</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/integrations">{copy.overview.viewHealth}<span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <div className="hero-visual" aria-label="Platform foundation illustration" role="img">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="visual-grid" />
          <div className="visual-card visual-card-main">
            <span className="visual-card-label">SYSTEM / 01</span>
            <strong>Secure by foundation</strong>
            <span className="visual-card-line"><i /> Database online</span>
            <span className="visual-card-line"><i /> Queue ready</span>
          </div>
          <div className="visual-card visual-card-mini">09:41<br /><span>UTC+03</span></div>
        </div>
      </div>
      <div className="metrics-grid">
        <article className="metric-card metric-card-accent">
          <div className="metric-card-top"><span>{copy.overview.statusLabel}</span><span className="status-dot" /></div>
          <strong>{copy.overview.statusValue}</strong>
          <small>PostgreSQL · Redis · Object storage</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>API</span><span className="metric-arrow">↗</span></div>
          <strong>v1</strong>
          <small>Versioned contract with OpenAPI</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>Data layer</span><span className="metric-arrow">↗</span></div>
          <strong>Ready</strong>
          <small>Migration-first PostgreSQL foundation</small>
        </article>
      </div>
      <article className="next-step-card">
        <div>
          <p className="eyebrow">Roadmap</p>
          <h2>{copy.overview.nextStepTitle}</h2>
          <p>{copy.overview.nextStepBody}</p>
        </div>
        <span className="next-step-number" aria-hidden="true">02</span>
      </article>
    </section>
  );
}
