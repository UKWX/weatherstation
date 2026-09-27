import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LiveLineChart } from '@/features/liveData/LiveLineChart'

describe('LiveLineChart', () => {
  function renderChart() {
    const rendered = render(
      <LiveLineChart
        title="Temperature"
        unit="°C"
        tMin={0}
        tMax={10}
        primary={{
          label: 'Primary',
          color: '#f00',
          points: Array.from({ length: 11 }, (_, index) => ({
            timestamp: index,
            value: index,
          })),
        }}
      />,
    )

    const svg = rendered.container.querySelector('.live-chart-svg')
    const overlay = rendered.container.querySelector('.live-chart-svg rect[fill="transparent"]')
    expect(svg).not.toBeNull()
    expect(overlay).not.toBeNull()

    vi.spyOn(svg!, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 20,
      left: 40,
      top: 20,
      right: 740,
      bottom: 280,
      width: 700,
      height: 260,
      toJSON: () => ({}),
    })
    vi.spyOn(overlay!, 'getBoundingClientRect').mockReturnValue({
      x: 94,
      y: 38,
      left: 94,
      top: 38,
      right: 620,
      bottom: 180,
      width: 526,
      height: 142,
      toJSON: () => ({}),
    })

    return { container: rendered.container, overlay: overlay! }
  }

  it('uses the left edge of the interactive plot for hover lookup', () => {
    const { container, overlay } = renderChart()

    fireEvent.pointerMove(overlay!, { clientX: 94, clientY: 90 })
    expect(container.querySelector('.chart-kit-tooltip')?.textContent).toContain('Primary')
    expect(container.querySelector('.chart-kit-tooltip')?.textContent).toContain('0.0 °C')
  })

})
