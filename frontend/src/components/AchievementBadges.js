// Auto-detected PRs & milestones stamped on a round at post time
// (rounds.achievements, computed in database/stats_layer.sql).

function AchievementBadges({ achievements }) {
  if (!achievements || !Array.isArray(achievements) || achievements.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {achievements.slice(0, 3).map((a, i) => (
        <span
          key={a.type || i}
          className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200"
        >
          {a.label}
        </span>
      ))}
    </div>
  )
}

export default AchievementBadges
