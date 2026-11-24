import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RoundCard from './RoundCard'

const round = {
  id: 'r1', user_id: 'alex', course_name: 'Pebble Beach Golf Links', club_name: 'Pebble Beach',
  city: 'Pebble Beach', state: 'CA', total: 84, front9: 41, back9: 43, par: 72, date: '2026-11-20',
  holes: [], coursePars: null, reactions: { fire: 3, goat: 2, clap: 1, skull: 1 }, userReacted: ['goat'], comments: [],
}

const renderCard = (props = {}) => {
  const onToggleReaction = jest.fn()
  render(
    <MemoryRouter>
      <RoundCard round={round} currentUserId="me" onToggleReaction={onToggleReaction} onAddComment={jest.fn()} onShare={jest.fn()} {...props} />
    </MemoryRouter>
  )
  return { onToggleReaction }
}

test('the + button opens all eight reactions in one group, and picking one reacts and closes it', () => {
  const { onToggleReaction } = renderCard()
  expect(screen.queryByRole('group', { name: 'All reactions' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Add reaction' }))
  const tray = screen.getByRole('group', { name: 'All reactions' })
  const buttons = within(tray).getAllByRole('button')
  expect(buttons.map(b => b.getAttribute('title'))).toEqual(['fire', 'clap', 'dart', 'goat', 'vomit', 'clown', 'skull', 'laugh'])
  expect(within(tray).getByTitle('goat')).toHaveAttribute('aria-pressed', 'true')
  expect(within(tray).getByTitle('dart')).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(within(tray).getByTitle('dart'))
  expect(onToggleReaction).toHaveBeenCalledWith('r1', 'dart')
  expect(screen.queryByRole('group', { name: 'All reactions' })).not.toBeInTheDocument()
})

test('the + button toggles the tray closed again', () => {
  renderCard()
  fireEvent.click(screen.getByRole('button', { name: 'Add reaction' }))
  fireEvent.click(screen.getByRole('button', { name: 'Hide reactions' }))
  expect(screen.queryByRole('group', { name: 'All reactions' })).not.toBeInTheDocument()
})

test('the public read-only card has no tray', () => {
  renderCard({ readOnly: true })
  expect(screen.queryByRole('button', { name: 'Add reaction' })).not.toBeInTheDocument()
})
