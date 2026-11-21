import { withMyReaction } from './reactions'

const card = (extra = {}) => ({
  id: 'r1',
  reactions: { fire: 2, clap: 0 },
  userReacted: [],
  ...extra,
})

test('switching a reaction on adds it and counts it', () => {
  const next = withMyReaction(card(), 'fire', true)
  expect(next.userReacted).toEqual(['fire'])
  expect(next.reactions.fire).toBe(3)
  expect(next.reactions.clap).toBe(0)
})

test('switching a reaction off removes it and uncounts it', () => {
  const next = withMyReaction(card({ reactions: { fire: 3 }, userReacted: ['fire', 'clap'] }), 'fire', false)
  expect(next.userReacted).toEqual(['clap'])
  expect(next.reactions.fire).toBe(2)
})

test('asking for the state the card already has changes nothing', () => {
  const on = card({ reactions: { fire: 3 }, userReacted: ['fire'] })
  expect(withMyReaction(on, 'fire', true)).toBe(on)
  const off = card()
  expect(withMyReaction(off, 'fire', false)).toBe(off)
})

test('never counts below zero and copes with missing fields', () => {
  const next = withMyReaction({ id: 'r1', userReacted: ['skull'] }, 'skull', false)
  expect(next.reactions.skull).toBe(0)
  expect(next.userReacted).toEqual([])

  const added = withMyReaction({ id: 'r1' }, 'goat', true)
  expect(added.reactions).toEqual({ goat: 1 })
  expect(added.userReacted).toEqual(['goat'])
})

test('does not change the card it was given', () => {
  const original = card()
  withMyReaction(original, 'fire', true)
  expect(original).toEqual(card())
})
