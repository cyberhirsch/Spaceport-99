/** Green when healthy, amber when hurt, red when about to be a problem. */
export const hpStyle = (ratio: number) => ({
  width: `${Math.max(0, ratio) * 100}%`,
  background: ratio > 0.6 ? '#38e8b0' : ratio > 0.3 ? '#ffc45a' : '#ff5470',
})
