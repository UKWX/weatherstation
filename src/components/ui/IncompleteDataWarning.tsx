import { Badge } from '@/components/ui/Badge'

export function IncompleteDataWarning({ message }: { readonly message: string }) {
  return (
    <p className="inline-warning" role="status">
      <Badge variant="warning">Incomplete</Badge> {message}
    </p>
  )
}
