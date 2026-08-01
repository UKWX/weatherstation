export function ErrorState({
  title,
  message,
  onRetry,
}: {
  readonly title: string
  readonly message: string
  readonly onRetry: () => void
}) {
  return (
    <section className="state-card state-error" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      <button type="button" className="button" onClick={onRetry}>
        Retry
      </button>
    </section>
  )
}
