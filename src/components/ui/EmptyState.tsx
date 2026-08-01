export function EmptyState({
  title,
  message,
}: {
  readonly title: string
  readonly message: string
}) {
  return (
    <section className="state-card" aria-live="polite">
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  )
}
