import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'

function UsernameSetup() {
  const { user, profile, updateProfile, loadProfile } = useAuth()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill with a suggestion based on their name or email
  const suggestedUsername = profile?.full_name
    ?.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20) || 
    user?.email?.split('@')[0]?.replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 20) || 
    ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    const cleanUsername = username.toLowerCase().replace(/\s/g, '')
    
    // Validate username format
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setError('Username must be 3-20 characters (letters, numbers, underscores only)')
      return
    }

    setLoading(true)

    try {
      // Check if username is already taken
      const { data: existing, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle()

      if (checkError) {
        throw checkError
      }

      if (existing) {
        setError('This username is already taken. Please choose another.')
        setLoading(false)
        return
      }

      // Update the profile with the new username
      const { error: updateError } = await updateProfile({ 
        username: cleanUsername 
      })

      if (updateError) {
        throw updateError
      }

      // Reload the profile to get the updated data
      await loadProfile(user.id)
      
      // The parent component will automatically re-render since profile now has username

    } catch (err) {
      console.error('Error setting username:', err)
      setError(err.message || 'Failed to set username. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <img src="/logo-full.png" alt="Dogleg.io" className="h-16 sm:h-20 object-contain" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Welcome to Dogleg! 🎉
          </h2>
          <p className="text-gray-600">
            One last step - choose a username for your profile
          </p>
        </div>

        {/* Welcome message with user info */}
        {profile?.full_name && (
          <div className="bg-green-50 rounded-lg p-4 mb-6 flex items-center gap-3">
            {profile?.avatar_url ? (
              <img 
                src={profile.avatar_url} 
                alt="Profile" 
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                <span className="text-green-700 font-semibold text-lg">
                  {profile.full_name?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="font-medium text-gray-800">{profile.full_name}</p>
              <p className="text-sm text-gray-600">{user?.email}</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Username form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder={suggestedUsername || 'johndoe'}
                autoComplete="username"
                required
                disabled={loading}
                maxLength={20}
                pattern="[a-z0-9_]{3,20}"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              3-20 characters. Letters, numbers, and underscores only.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || username.length < 3}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Setting up...
              </span>
            ) : (
              "Let's Go! ⛳"
            )}
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          Your username is how other golfers will find and follow you.
        </p>
      </div>
    </div>
  )
}

export default UsernameSetup