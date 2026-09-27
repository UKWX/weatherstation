export type TooltipPosition = {
  readonly left: number
  readonly top: number
}

const OFFSET = 14
const EDGE_PADDING = 8

export function positionTooltip(
  clientX: number,
  clientY: number,
  tooltipWidth: number,
  tooltipHeight: number,
  containerRect: DOMRect,
): TooltipPosition {
  const localX = clientX - containerRect.left
  const localY = clientY - containerRect.top

  let left = localX + OFFSET
  if (left + tooltipWidth + EDGE_PADDING > containerRect.width) {
    left = localX - tooltipWidth - OFFSET
  }
  left = Math.max(EDGE_PADDING, Math.min(left, containerRect.width - tooltipWidth - EDGE_PADDING))

  let top = localY - tooltipHeight / 2
  top = Math.max(EDGE_PADDING, Math.min(top, containerRect.height - tooltipHeight - EDGE_PADDING))

  return { left, top }
}
