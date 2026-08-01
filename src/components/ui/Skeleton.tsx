export function Skeleton({ lines = 1 }: { readonly lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label="Loading content">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton-line" />
      ))}
    </div>
  )
}
