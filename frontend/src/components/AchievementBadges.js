// Auto-detected PRs & milestones stamped on a round at post time
// (rounds.achievements, computed in database/stats_layer.sql).
// Badges pop in with a small stagger — they're the celebration moment
// on a card, so they get the one springy animation in the app.

// Only badges with a plain-text label are drawn. The data comes from the
// database, and a forged row (e.g. label: {"a": 1}) would otherwise crash
// React ("Objects are not valid as a React child") and blank the whole feed
// for everyone who loads that round.
const isDrawable = (a) => a && typeof a === 'object' && typeof a.label === 'string' && a.label.trim() !== ''

function AchievementBadges({ achievements }) {
  if (!Array.isArray(achievements)) return null

  const badges = achievements.filter(isDrawable).slice(0, 3)
  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((a, i) => (
        <span
          // type is only used as a key when it's a string; otherwise the position
          key={typeof a.type === 'string' ? `${a.type}-${i}` : i}
          className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 animate-badge-pop"
          style={{ animationDelay: `${0.1 + i * 0.08}s` }}
        >
          {a.label}
        </span>
      ))}
    </div>
  )
}

export default AchievementBadges
