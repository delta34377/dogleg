// The one date treatment for the whole app. Before this existed, round
// dates rendered as "6/7/2026" on cards, "Jun 7" in stats, and "Today"
// in the old helper depending on which component you were looking at.
//
// Rules:
//   formatDate      → "Today" / "Yesterday" / "Jun 30" / "Jun 30, 2025"
//   formatTimeAgo   → "just now" / "12m" / "3h", then falls back to formatDate
//
// Date-only strings ("2026-07-04") are parsed as local dates, never through
// new Date(string) — that treats them as UTC midnight and shifts the day for
// anyone west of Greenwich.

export function parseLocalDate(dateString) {
  if (!dateString) return null
  const str = String(dateString)
  const [datePart, timePart] = str.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) {
    const fallback = new Date(str)
    return isNaN(fallback) ? null : fallback
  }
  if (timePart) {
    const full = new Date(str)
    if (!isNaN(full)) return full
  }
  return new Date(y, m - 1, d)
}

export function formatDate(dateString) {
  const date = parseLocalDate(dateString)
  if (!date) return ''

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = startOfDay(new Date())
  const that = startOfDay(date)
  const dayDiff = Math.round((today - that) / 86400000)

  if (dayDiff === 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'

  const opts = { month: 'short', day: 'numeric' }
  if (that.getFullYear() !== today.getFullYear()) opts.year = 'numeric'
  return date.toLocaleDateString('en-US', opts)
}

// For timestamps (comments, activity) — compact relative time like a feed.
export function formatTimeAgo(timestamp) {
  const date = parseLocalDate(timestamp)
  if (!date) return ''

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return formatDate(timestamp)
}
