import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LiveLineChart } from '@/features/liveData/LiveLineChart'

describe('LiveLineChart', () => {
  it('uses the interactive plot bounds for hover lookup', () => {
    const { container } = render(
      <LiveLineChart
        title="Temperature"
        unit="°C"
        tMin={0}
        tMax={2}
        primary={{
          label: 'Primary',
          color: '#f00',
          points: [
            { timestamp: 0, value: 1 },
            { timestamp: 1, value: 2 },
            { timestamp: 2, value: 3 },
          ],
        }}
      />,
    )

    const svg = container.querySelector('.live-chart-svg')
    const overlay = container.querySelector('.live-chart-svg rect[fill="transparent"]')
    expect(svg).not.toBeNull()
    expect(overlay).not.toBeNull()

    vi.spyOn(svg!, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 20,
      left: 40,
      top: 20,
      right: 640,
      bottom: 280,
      width: 600,
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

    fireEvent.pointerMove(overlay!, { clientX: 94, clientY: 90 })
    expect(screen.getByText('Primary: 1.0 °C')).toBeInTheDocument()

    fireEvent.pointerMove(overlay!, { clientX: 620, clientY: 90 })
    expect(screen.getByText('Primary: 3.0 °C')).toBeInTheDocument()
  })
})
