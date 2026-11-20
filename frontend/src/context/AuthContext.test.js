import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase } from '../services/supabase'

// The real Supabase client needs environment settings. This stand-in covers
// what AuthProvider calls when a new user signs in for the first time: the
// session, the profile lookup (no row yet), and creating the profile row.
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      getSession: jest.fn(),
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}))

const authUser = {
  id: 'user-1',
  email: null,
  phone: '+15551234567',
  user_metadata: { username: 'alex_fairway', full_name: 'Alex', wants_newsletter: true },
}

let inserted

function mockProfilesTable() {
  inserted = []
  supabase.from.mockImplementation(() => ({
    // loadProfile: select('*').eq('id', ...).single() finds no row yet
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
      }),
    }),
    // createProfile: insert([row]).select().single()
    insert: (rows) => {
      inserted.push(...rows)
      return { select: () => ({ single: async () => ({ data: { ...rows[0] }, error: null }) }) }
    },
  }))
}

function ShowProfile() {
  const { profile } = useAuth()
  return <p>{profile ? `profile for ${profile.username}` : 'no profile'}</p>
}

beforeEach(() => {
  mockProfilesTable()
  supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } })
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: authUser, expires_at: null } } })
  supabase.auth.getUser.mockResolvedValue({ data: { user: authUser } })
})

it('creates the profile without copying the phone number into it (DEPLOY-1)', async () => {
  render(<AuthProvider><ShowProfile /></AuthProvider>)

  expect(await screen.findByText('profile for alex_fairway')).toBeInTheDocument()
  await waitFor(() => expect(inserted).toHaveLength(1))

  const row = inserted[0]
  // Other signed-in users can read profile rows; the number stays in the
  // sign-in record (auth.users), where Profile.js reads it for the owner
  expect(row).not.toHaveProperty('phone')
  expect(JSON.stringify(row)).not.toContain('5551234567')
  expect(row).toMatchObject({
    id: 'user-1',
    username: 'alex_fairway',
    full_name: 'Alex',
    wants_newsletter: true,
  })
})
