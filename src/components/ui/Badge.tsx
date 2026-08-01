import type { PropsWithChildren } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'provisional'

type BadgeProps = PropsWithChildren<{
  readonly variant?: BadgeVariant
}>

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

export function ProvisionalBadge() {
  return <Badge variant="provisional">Provisional</Badge>
}
