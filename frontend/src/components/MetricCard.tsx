import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  trend?: string;
  icon?: ReactNode;
}

export const MetricCard = ({ label, value, trend, icon }: MetricCardProps) => (
  <article className="metric-card">
    <header>
      <p>{label}</p>
      <span>{icon}</span>
    </header>
    <strong>{value}</strong>
    {trend ? <small>{trend}</small> : null}
  </article>
);
