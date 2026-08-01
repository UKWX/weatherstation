import type { PropsWithChildren } from 'react'

export function CardGrid({ children }: PropsWithChildren) {
  return <div className="card-grid">{children}</div>
}
