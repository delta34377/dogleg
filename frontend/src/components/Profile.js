import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import AvatarUpload from '../components/AvatarUpload'  
import { supabase } from '../services/supabase'
import { followService } from '../services/followService'

function Profile() {
  const { user, profile, updateProfile, signOut } = useAuth()
  const [roundsCount, setRoundsCount] = useState(0)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    handicap: '',
    location: ''
  })

  const [followCounts, setFollowCounts] = useState({
  followers: 0,
  following: 0
})

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        handicap: profile.handicap || '',
        location: profile.location || ''
      })
    }
  }, [profile])

  // Get actual follow counts from follows table
  useEffect(() => {
    const getFollowCounts = async () => {
      if (!user) return
      
      const counts = await followService.getFollowCounts(user.id)
      setFollowCounts({
        followers: counts.followers,
        following: counts.following
      })
    }
    
    getFollowCounts()
  }, [user])

  // Get actual rounds count from database
  useEffect(() => {
    const getRoundsCount = async () => {
      if (!user) return
      
      const { count } = await supabase
        .from('rounds')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      
      setRoundsCount(count || 0)
    }
    
    getRoundsCount()
  }, [user])

  // Add null check after useEffect
  if (!user) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p>Please log in to view your profile</p>
        </div>
      </div>
    )
  }

  const handleSave = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await updateProfile({
      full_name: formData.full_name.trim(),
      bio: formData.bio.trim(),
      handicap: formData.handicap ? parseInt(formData.handicap) : null,
      location: formData.location.trim()
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Profile updated successfully!')
      setEditing(false)
      setTimeout(() => setMessage(''), 3000)
    }
    setLoading(false)
  }

  // Handle successful avatar upload
  const handleAvatarUpload = (newAvatarUrl) => {
    setMessage('Profile picture updated successfully!')
    setTimeout(() => setMessage(''), 3000)
  }

  const stats = [
    { label: 'Rounds', value: roundsCount }, // if you implemented my earlier fix
    { label: 'Followers', value: followCounts.followers },
    { label: 'Following', value: followCounts.following }
  ]

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header with avatar - UPDATED */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-8">
          <div className="flex items-center gap-4">
            {/* Replace old avatar div with AvatarUpload component */}
            <AvatarUpload
              size="lg"
              editable={true}  // Always editable on profile page
              profile={profile}
              onUploadComplete={handleAvatarUpload}
              className=""
            />
            <div className="text-white">
              <h1 className="text-2xl font-bold">
                {profile?.full_name || profile?.username || 'Golfer'}
              </h1>
              {profile?.username && (
                <p className="text-green-100">@{profile.username}</p>
              )}
              {profile?.location && (
                <p className="text-green-100 flex items-center gap-1 mt-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {profile.location}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 border-b border-gray-200">
          {stats.map((stat, index) => (
            <div key={index} className="p-4 text-center border-r last:border-r-0 border-gray-200">
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-sm text-gray-600">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Profile content */}
        <div className="p-6">
          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              message.includes('success') 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {message}
            </div>
          )}

          {!editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium">{user?.email}</p>
                </div>

                {user?.phone && (
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-medium">{user.phone}</p>
                  </div>
                )}

                {profile?.username && (
                  <div>
                    <p className="text-sm text-gray-600">Username</p>
                    <p className="font-medium">@{profile.username}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-600">Handicap</p>
                  <p className="font-medium">
                    {profile?.handicap !== null ? profile.handicap : 'Not set'}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-600">Member Since</p>
                  <p className="font-medium">
                    {profile?.created_at 
                      ? new Date(profile.created_at).toLocaleDateString()
                      : 'Recently joined'}
                  </p>
                </div>
              </div>

              {profile?.bio && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">About</p>
                  <p className="text-gray-800">{profile.bio}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 sm:flex-initial px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  Edit Profile
                </button>
                
                <button
                  onClick={signOut}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Handicap
                  </label>
                  <input
                    type="number"
                    value={formData.handicap}
                    onChange={(e) => setFormData({...formData, handicap: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="15"
                    min="0"
                    max="54"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="New York, NY"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bio
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({...formData, bio: e.target.value.slice(0, 280)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  rows="3"
                  placeholder="Tell us about your golf journey..."
                  maxLength={280}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.bio.length}/280 characters
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 sm:flex-initial px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                
                <button
                  onClick={() => {
                    setEditing(false)
                    setMessage('')
                    setFormData({
                      full_name: profile?.full_name || '',
                      bio: profile?.bio || '',
                      handicap: profile?.handicap || '',
                      location: profile?.location || ''
                    })
                  }}
                  disabled={loading}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
           )}
        </div>

        {/* Legal Links */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-center gap-4 text-sm text-gray-500">
            <a href="/terms" className="hover:text-gray-700 hover:underline">Terms of Service</a>
            <span>•</span>
            <a href="/privacy" className="hover:text-gray-700 hover:underline">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Profile