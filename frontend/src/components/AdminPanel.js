import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

function AdminPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  
  // CHANGE THIS TO YOUR USER ID OR EMAIL
  const ADMIN_EMAIL = 'markgreenfield1@gmail.com' // <-- PUT YOUR EMAIL HERE
  
  // Default algorithm settings
  const defaultSettings = {
    discoveryRatio: 0.3,  // 30% discovery, 70% following
    popularThreshold: 3,   // Min reactions for "popular"
    commentThreshold: 2,   // Min comments for "popular"
    nearbyRadius: 15,      // Miles for "near you" courses
    recencyWeight: 0.6,    // Weight for how recent (0.6 = 60%)
    engagementWeight: 0.3, // Weight for engagement (reactions/comments)
    affinityWeight: 0.1,   // Weight for course affinity
    feedLimit: 10,         // Rounds per page
    mode: 'mixed'          // 'mixed', 'following', or 'discovery'
  }
  
  // Load settings from localStorage or use defaults
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('feedAlgorithmSettings')
    return saved ? JSON.parse(saved) : defaultSettings
  })
  
  const [message, setMessage] = useState('')
  
  // Check if user is admin
  useEffect(() => {
    if (!user || user.email !== ADMIN_EMAIL) {
      navigate('/')
    }
  }, [user, navigate])
  
  // Don't render anything if not admin
  if (!user || user.email !== ADMIN_EMAIL) {
    return null
  }
  
  const handleChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }))
  }
  
  const applySettings = () => {
    // Save to localStorage
    localStorage.setItem('feedAlgorithmSettings', JSON.stringify(settings))
    setMessage('Settings saved! Refreshing feed...')
    
    // Refresh the page after a short delay to apply new settings
    setTimeout(() => {
      navigate('/')
      window.location.reload()
    }, 1000)
  }
  
  const resetToDefaults = () => {
    setSettings(defaultSettings)
    localStorage.removeItem('feedAlgorithmSettings')
    setMessage('Reset to defaults!')
  }
  
  const testSettings = () => {
    // Open feed in new tab with test params
    const params = new URLSearchParams({
      test: 'true',
      discovery: settings.discoveryRatio,
      mode: settings.mode
    })
    window.open(`/?${params}`, '_blank')
  }
  
  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-6">🔧 Feed Algorithm Admin Panel</h1>
        
        {message && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg">
            {message}
          </div>
        )}
        
        <div className="space-y-6">
          {/* Feed Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Feed Mode
            </label>
            <select
              value={settings.mode}
              onChange={(e) => handleChange('mode', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="mixed">Mixed (Following + Discovery)</option>
              <option value="following">Following Only</option>
              <option value="discover">Discovery Only</option>
            </select>
          </div>
          
          {/* Discovery Ratio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Discovery Mix: {Math.round(settings.discoveryRatio * 100)}% discovery / {Math.round((1 - settings.discoveryRatio) * 100)}% following
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.discoveryRatio}
              onChange={(e) => handleChange('discoveryRatio', parseFloat(e.target.value))}
              className="w-full"
              disabled={settings.mode !== 'mixed'}
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>All Following</span>
              <span>50/50</span>
              <span>All Discovery</span>
            </div>
          </div>
          
          {/* Popular Round Thresholds */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Popular: Min Reactions
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.popularThreshold}
                onChange={(e) => handleChange('popularThreshold', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Popular: Min Comments
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.commentThreshold}
                onChange={(e) => handleChange('commentThreshold', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          
          {/* Nearby Radius */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              "Near You" Radius: {settings.nearbyRadius} miles
            </label>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={settings.nearbyRadius}
              onChange={(e) => handleChange('nearbyRadius', parseInt(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Scoring Weights */}
          <div>
            <h3 className="font-medium text-gray-700 mb-3">Scoring Weights (must total 100%)</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Recency: {Math.round(settings.recencyWeight * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.recencyWeight}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value)
                    const remaining = 1 - newValue
                    handleChange('recencyWeight', newValue)
                    // Auto-adjust other weights proportionally
                    if (remaining > 0) {
                      const engagementRatio = settings.engagementWeight / (settings.engagementWeight + settings.affinityWeight)
                      handleChange('engagementWeight', remaining * engagementRatio)
                      handleChange('affinityWeight', remaining * (1 - engagementRatio))
                    }
                  }}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Engagement: {Math.round(settings.engagementWeight * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.engagementWeight}
                  onChange={(e) => handleChange('engagementWeight', parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Course Affinity: {Math.round(settings.affinityWeight * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.affinityWeight}
                  onChange={(e) => handleChange('affinityWeight', parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              
              <div className="text-sm text-gray-500">
                Total: {Math.round((settings.recencyWeight + settings.engagementWeight + settings.affinityWeight) * 100)}%
              </div>
            </div>
          </div>
          
          {/* Feed Pagination */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rounds per page
            </label>
            <input
              type="number"
              min="5"
              max="50"
              step="5"
              value={settings.feedLimit}
              onChange={(e) => handleChange('feedLimit', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          
          {/* Current Settings Display */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-medium text-gray-700 mb-2">Current Algorithm Formula:</h3>
            <code className="text-xs text-gray-600">
              Score = {(settings.recencyWeight).toFixed(1)} * recency_score + {(settings.engagementWeight).toFixed(1)} * engagement_score + {(settings.affinityWeight).toFixed(1)} * affinity_score
            </code>
            <div className="mt-2 text-xs text-gray-500">
              Mode: {settings.mode} | 
              Discovery: {Math.round(settings.discoveryRatio * 100)}% | 
              Popular: {settings.popularThreshold}+ reactions or {settings.commentThreshold}+ comments
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={applySettings}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              Apply & Refresh Feed
            </button>
            
            <button
              onClick={testSettings}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Test in New Tab
            </button>
            
            <button
              onClick={resetToDefaults}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
      
      {/* Quick Stats */}
      <div className="mt-6 bg-white rounded-lg shadow p-4">
        <h3 className="font-medium text-gray-700 mb-3">Quick Presets:</h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              setSettings({...defaultSettings, mode: 'following', discoveryRatio: 0})
              setMessage('Preset: Following Only')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            Following Only
          </button>
          
          <button
            onClick={() => {
              setSettings({...defaultSettings, discoveryRatio: 0.5})
              setMessage('Preset: 50/50 Mix')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            50/50 Mix
          </button>
          
          <button
            onClick={() => {
              setSettings({...defaultSettings, mode: 'discovery', discoveryRatio: 1})
              setMessage('Preset: Discovery Only')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            Discovery Only
          </button>
          
          <button
            onClick={() => {
              setSettings({...defaultSettings, recencyWeight: 0.8, engagementWeight: 0.15, affinityWeight: 0.05})
              setMessage('Preset: Prioritize Fresh')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            Fresh Content
          </button>
          
          <button
            onClick={() => {
              setSettings({...defaultSettings, recencyWeight: 0.3, engagementWeight: 0.6, affinityWeight: 0.1})
              setMessage('Preset: Prioritize Popular')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            Popular First
          </button>
          
          <button
            onClick={() => {
              setSettings({...defaultSettings, recencyWeight: 0.3, engagementWeight: 0.2, affinityWeight: 0.5})
              setMessage('Preset: Course-Based')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            Course Affinity
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel