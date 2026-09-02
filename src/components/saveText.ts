/** Elapsed seconds as a short span: 47s, 12m, 3h 08m, 2d 04h. */
export const spanOf = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(s / 86400)}d ${String(Math.floor((s % 86400) / 3600)).padStart(2, '0')}h`
}

/** How long ago a timestamp was, in words. */
export const agoOf = (at: number): string => {
  const s = Math.max(0, (Date.now() - at) / 1000)
  if (s < 45) return 'just now'
  return `${spanOf(s)} ago`
}
