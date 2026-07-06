import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  trend?: string;
  detail?: string;
  icon?: ReactNode;
  tone?: 'temperature' | 'rain' | 'wind' | 'pressure' | 'lightning' | 'neutral';
}

export const MetricCard = ({ label, value, trend, detail, icon, tone = 'neutral' }: MetricCardProps) => (
  <article className={`metric-card metric-card--${tone}`}>
    <header>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
      {icon ? <span className="metric-card__icon">{icon}</span> : null}
    </header>
    <div className="metric-card__meta">
      {trend ? <small>{trend}</small> : null}
      {detail ? <span>{detail}</span> : null}
    </div>
  </article>
);
