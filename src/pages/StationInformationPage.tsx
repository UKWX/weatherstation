import { useState } from 'react'
import {
  Badge,
  CardGrid,
  Modal,
  ProvisionalBadge,
  TableWrapper,
  Tooltip,
  VisuallyHidden,
} from '@/components/ui'

export default function StationInformationPage() {
  const [definitionsOpen, setDefinitionsOpen] = useState(false)

  return (
    <section className="card" aria-labelledby="station-information-title">
      <h2 id="station-information-title">Station profile and metadata</h2>
      <p>
        Wakefield, United Kingdom. This page intentionally excludes any precise
        private street-level address.
      </p>

      <CardGrid>
        <article className="card">
          <h3>Coverage windows</h3>
          <ul>
            <li>Temperature coverage: from 1995-01-01</li>
            <li>Rainfall coverage: from 2020-05-01</li>
            <li>Official maximum window: 06:00 to 06:00 (Europe/London)</li>
            <li>Official minimum window: 18:00 to 18:00 (Europe/London)</li>
            <li>Official rainfall window: 00:00 to 00:00 (Europe/London)</li>
          </ul>
        </article>

        <article className="card">
          <h3>Units and baselines</h3>
          <ul>
            <li>Timezone: Europe/London</li>
            <li>Temperature: °C</li>
            <li>Rainfall: mm</li>
            <li>Pressure: hPa</li>
            <li>Wind: mph</li>
            <li>Daily temperature normals baseline: 1995–2024</li>
            <li>Monthly normals baseline: 1991–2020</li>
          </ul>
        </article>
      </CardGrid>

      <TableWrapper>
        <table>
          <caption>Data-state and completeness policy</caption>
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col">Display</th>
              <th scope="col">Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Live</td>
              <td>
                <Badge variant="success">Live</Badge>
              </td>
              <td>Minute observations used for intraday monitoring.</td>
            </tr>
            <tr>
              <td>Provisional</td>
              <td>
                <ProvisionalBadge />
              </td>
              <td>Pre-final value before official archive finalisation.</td>
            </tr>
            <tr>
              <td>Finalised</td>
              <td>
                <Badge variant="default">Finalised</Badge>
              </td>
              <td>Official value published in climate archive output.</td>
            </tr>
            <tr>
              <td>Incomplete</td>
              <td>
                <Badge variant="warning">Incomplete</Badge>
              </td>
              <td>Expected observations are missing in the aggregation period.</td>
            </tr>
            <tr>
              <td>Unavailable</td>
              <td>
                <Badge variant="default">Unavailable</Badge>
              </td>
              <td>
                Rainfall before 2020-05-01 remains unavailable and must stay
                null, never converted to 0.
              </td>
            </tr>
          </tbody>
        </table>
      </TableWrapper>

      <p>
        Rain-day definition:{' '}
        <Tooltip content="A rain day is counted only when rainfall_mm is greater than 0.1.">
          <strong>rainfall_mm &gt; 0.1</strong>
        </Tooltip>
        <VisuallyHidden>
          Exactly 0.1 millimetres is excluded from rain-day totals.
        </VisuallyHidden>
      </p>

      <p>
        Public data source:{' '}
        <code>https://ukwx.duckdns.org/station-data</code> with published
        endpoints for live, status, archive and normals datasets.
      </p>

      <button
        type="button"
        className="button"
        onClick={() => setDefinitionsOpen(true)}
      >
        View data lifecycle definitions
      </button>

      <Modal
        title="Live vs provisional vs finalised"
        open={definitionsOpen}
        onClose={() => setDefinitionsOpen(false)}
      >
        <p>
          Live values update frequently and support operational monitoring.
          Provisional values are interim daily summaries before official windows
          close. Finalised values are fixed climate-archive outputs for official
          reporting.
        </p>
        <p>
          Missing values are shown as em dashes and remain distinct from genuine
          zeroes (for example 0.0 mm on dry days).
        </p>
      </Modal>
    </section>
  )
}
