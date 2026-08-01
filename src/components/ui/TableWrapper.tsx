import type { PropsWithChildren } from 'react'

export function TableWrapper({ children }: PropsWithChildren) {
  return <div className="table-wrapper">{children}</div>
}
