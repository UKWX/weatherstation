import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'

export interface ChartHoverState {
  readonly activeIndex: number | null
  readonly clientX: number | null
  readonly clientY: number | null
}

export function useChartHover({
  count,
  containerRef,
}: {
  readonly count: number
  readonly containerRef: RefObject<HTMLElement | SVGElement | null>
}) {
  const [state, setState] = useState<ChartHoverState>({
    activeIndex: null,
    clientX: null,
    clientY: null,
  })

  const setFromEvent = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      if (count <= 0) {
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      const activeIndex = Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))))
      setState({ activeIndex, clientX: event.clientX, clientY: event.clientY })
    },
    [count],
  )

  const clear = useCallback(() => {
    setState({ activeIndex: null, clientX: null, clientY: null })
  }, [])

  useEffect(() => {
    if (state.activeIndex == null) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current
      if (container == null) {
        clear()
        return
      }
      if (event.target instanceof Node && !container.contains(event.target)) {
        clear()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [clear, containerRef, state.activeIndex])

  useEffect(() => {
    if (count <= 0 && state.activeIndex != null) {
      clear()
    }
  }, [clear, count, state.activeIndex])

  const overlayProps = useMemo(
    () => ({
      onPointerMove: setFromEvent,
      onPointerDown: setFromEvent,
      onPointerLeave: (event: ReactPointerEvent<SVGRectElement>) => {
        if (event.pointerType === 'mouse') {
          clear()
        }
      },
      style: { touchAction: 'none' } as const,
      tabIndex: 0,
      onKeyDown: (event: ReactKeyboardEvent<SVGRectElement>) => {
        if (count <= 0) {
          return
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          setState((current) => {
            const activeIndex = Math.max(0, (current.activeIndex ?? 0) - 1)
            return { ...current, activeIndex }
          })
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          setState((current) => {
            const activeIndex = Math.min(count - 1, (current.activeIndex ?? -1) + 1)
            return { ...current, activeIndex }
          })
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          clear()
        }
      },
      onFocus: () => {
        if (count > 0) {
          setState((current) => ({ ...current, activeIndex: current.activeIndex ?? 0 }))
        }
      },
      onBlur: () => clear(),
    }),
    [clear, count, setFromEvent],
  )

  return {
    ...state,
    clear,
    setHover: useCallback((activeIndex: number | null, clientX: number | null, clientY: number | null) => {
      setState({ activeIndex, clientX, clientY })
    }, []),
    setActiveIndex: useCallback((activeIndex: number | null) => {
      setState((current) => ({ ...current, activeIndex }))
    }, []),
    overlayProps,
  }
}
