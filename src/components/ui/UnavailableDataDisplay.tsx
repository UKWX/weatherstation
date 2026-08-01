import { Badge } from '@/components/ui/Badge'

export function UnavailableDataDisplay({
  title,
  message,
}: {
  readonly title: string
  readonly message: string
}) {
  return (
    <section className="state-card" role="status" aria-live="polite">
      <p>
        <Badge variant="default">Unavailable</Badge>
      </p>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  )
}
