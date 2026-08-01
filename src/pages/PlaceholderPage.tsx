import {
  CardGrid,
  EmptyState,
  IncompleteDataWarning,
  ResponsiveChartContainer,
  TableWrapper,
} from '@/components/ui'

export function PlaceholderPage({
  title,
  message,
  showChart = false,
  showTable = false,
}: {
  readonly title: string
  readonly message: string
  readonly showChart?: boolean
  readonly showTable?: boolean
}) {
  return (
    <section className="card">
      <CardGrid>
        <EmptyState title={`${title} in progress`} message={message} />
        <div className="card">
          <h2>Data quality</h2>
          <IncompleteDataWarning message="This section is pending full metric integration." />
        </div>
      </CardGrid>

      {showTable ? (
        <TableWrapper>
          <table>
            <caption>{title} sample table layout</caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Observed</td>
                <td>—</td>
              </tr>
              <tr>
                <td>Reference</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </TableWrapper>
      ) : null}

      {showChart ? (
        <ResponsiveChartContainer>
          <div className="chart-frame" role="img" aria-label={`${title} chart placeholder`}>
            Responsive chart container
          </div>
        </ResponsiveChartContainer>
      ) : null}
    </section>
  )
}
