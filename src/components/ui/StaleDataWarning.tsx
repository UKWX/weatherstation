import { Badge } from '@/components/ui/Badge'

export function StaleDataWarning({ message }: { readonly message: string }) {
  return (
    <p className="inline-warning" role="status">
      <Badge variant="warning">Stale data</Badge> {message}
    </p>
  )
}
