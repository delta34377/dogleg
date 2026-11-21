// The signed-in user's reaction on a round card, switched on or off.
//
// Every page that shows round cards (Feed, My Rounds, a golfer's profile, a
// single round) keeps a card as { reactions: { fire: 3, ... }, userReacted:
// ['fire', ...] }. This returns the card with the user's `reactionType`
// reaction present (shouldHave = true) or absent (false) and its count moved
// to match. Asking for the state the card already has changes nothing (the
// same object comes back), so applying it twice is harmless.
export function withMyReaction(round, reactionType, shouldHave) {
  const mine = round.userReacted || []
  if (mine.includes(reactionType) === shouldHave) return round

  const count = round.reactions?.[reactionType] || 0
  return {
    ...round,
    reactions: {
      ...round.reactions,
      [reactionType]: shouldHave ? count + 1 : Math.max(0, count - 1),
    },
    userReacted: shouldHave
      ? [...mine, reactionType]
      : mine.filter((type) => type !== reactionType),
  }
}
