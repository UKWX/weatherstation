import type { PropsWithChildren } from 'react';
import type { ReactNode } from 'react';

interface PanelCardProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export const PanelCard = ({ title, subtitle, action, className, children }: PanelCardProps) => (
  <section className={`panel-card${className ? ` ${className}` : ''}`}>
    <header className="panel-card__header">
      <div>
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
    <div className="panel-card__content">{children}</div>
  </section>
);
