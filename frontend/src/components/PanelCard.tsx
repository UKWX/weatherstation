import type { PropsWithChildren } from 'react';

interface PanelCardProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
}

export const PanelCard = ({ title, subtitle, children }: PanelCardProps) => (
  <section className="panel-card">
    <header>
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
    {children}
  </section>
);
