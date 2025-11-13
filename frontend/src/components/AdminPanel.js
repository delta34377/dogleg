import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { getFeedSettings, saveFeedSettings } from '../services/feedSettingsService'

function AdminPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  
  const ADMIN_EMAIL = 'markgreenfield1@gmail.com'
  
  // Default settings - used if no global settings exist
  const defaultSettings = {
    mode: 'following',
    discoveryRatio: 0,
    feedLimit: 10,
    useChronological: true,  // Add this to defaults
    // UI-only fields (not saved to DB)
    popularThreshold: 3,
    commentThreshold: 2,
    nearbyRadius: 15,
    recencyWeight: 0.6,
    engagementWeight: 0.3,
    affinityWeight: 0.1
  }
  
  const [settings, setSettings] = useState(defaultSettings)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  
  // Load current global settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await getFeedSettings()
        setSettings({
          ...defaultSettings,  // Keep UI-only fields
          ...currentSettings,   // Override with DB values
          useChronological: true  // Always true since we only use chronological function
        })
      } catch (error) {
        console.error('Error loading settings:', error)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])
  
  // Check if user is admin
  useEffect(() => {
    if (!user || user.email !== ADMIN_EMAIL) {
      navigate('/')
    }
  }, [user, navigate])
  
  if (!user || user.email !== ADMIN_EMAIL) {
    return null
  }
  
  if (loading) {
    return <div className="p-4">Loading settings...</div>
  }
  
  const handleChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }))
  }
  
  const applySettings = async () => {
    try {
      // Save the core feed settings to DB
      const settingsToSave = {
        mode: settings.mode,
        discoveryRatio: settings.discoveryRatio,
        feedLimit: settings.feedLimit
      }
      
      await saveFeedSettings(settingsToSave)
      setMessage('Settings saved globally! All users will see changes.')
      
      // Refresh after a moment
      setTimeout(() => {
        navigate('/')
        window.location.reload()
      }, 1000)
    } catch (error) {
      console.error('Error saving settings:', error)
      setMessage('Error saving settings: ' + error.message)
    }
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
          {/* Feed Ordering Info - Now just informational */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Feed Ordering: Chronological
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  All feeds use pure chronological ordering - newest rounds always appear first
                </p>
              </div>
              <div className="text-2xl">📅</div>
            </div>
            <div className="text-xs text-gray-600">
              Reactions and engagement do NOT affect round visibility or order
            </div>
          </div>
          
          {/* Feed Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Feed Content Mode
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
            <p className="text-xs text-gray-500 mt-1">
              {settings.mode === 'mixed' && "Shows rounds from people you follow PLUS popular/nearby rounds"}
              {settings.mode === 'following' && "Shows ONLY rounds from people you follow"}
              {settings.mode === 'discover' && "Shows ONLY discovery rounds (popular/nearby)"}
            </p>
          </div>
          
          {/* Discovery Ratio */}
          <div className={settings.mode !== 'mixed' ? 'opacity-50' : ''}>
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
            {settings.mode !== 'mixed' && (
              <p className="text-xs text-orange-600 mt-1">
                ⚠️ Only applies in Mixed mode
              </p>
            )}
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
            <h3 className="font-medium text-gray-700 mb-2">Current Settings:</h3>
            <div className="text-xs text-gray-600 space-y-1">
              <div>📅 Order: <span className="font-medium">Chronological (newest first)</span></div>
              <div>📰 Mode: <span className="font-medium">{settings.mode}</span></div>
              {settings.mode === 'mixed' && (
                <div>🔀 Mix: <span className="font-medium">{Math.round(settings.discoveryRatio * 100)}% discovery / {Math.round((1 - settings.discoveryRatio) * 100)}% following</span></div>
              )}
              <div>📊 Page size: <span className="font-medium">{settings.feedLimit} rounds</span></div>
              <div>🔥 Popular threshold: <span className="font-medium">{settings.popularThreshold}+ reactions or {settings.commentThreshold}+ comments</span></div>
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
      
      {/* Quick Presets */}
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
              setSettings({...defaultSettings, mode: 'mixed', discoveryRatio: 0.5})
              setMessage('Preset: 50/50 Mix')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            50/50 Mix
          </button>
          
          <button
            onClick={() => {
              setSettings({...defaultSettings, mode: 'mixed', discoveryRatio: 0.3})
              setMessage('Preset: 70/30 Mix')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            70/30 Mix
          </button>
          
          <button
            onClick={() => {
              setSettings({...defaultSettings, mode: 'discover', discoveryRatio: 1})
              setMessage('Preset: Discovery Only')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            Discovery Only
          </button>
          
          <button
            onClick={() => {
              setSettings({...defaultSettings, mode: 'mixed', discoveryRatio: 0.1})
              setMessage('Preset: Minimal Discovery (90/10)')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            Minimal Discovery
          </button>
          
          <button
            onClick={() => {
              setSettings({...defaultSettings, mode: 'mixed', discoveryRatio: 0.7})
              setMessage('Preset: Discovery Heavy (30/70)')
            }}
            className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
          >
            Discovery Heavy
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel