/** Heat band → CSS class. Shared by full cards and the opponent mini-cells. */
export function heatClass(v: number): string {
  if (v <= -1) return 'heat-sink'
  if (v === 0) return 'heat-zero'
  if (v <= 4) return 'heat-low'
  if (v <= 8) return 'heat-mid'
  return 'heat-high'
}
