import { supabase } from './supabase'

const DEFAULTS = { mode: 'following', discoveryRatio: 0, feedLimit: 10 }
let cache = null

function normalize(raw) {
  const r = raw || {}
  
  // Allow all three modes
  const mode = r.mode === 'mixed' || r.mode === 'following' || r.mode === 'discover'
    ? r.mode
    : 'following'  // default
    
  // Adjust discovery ratio based on mode
  const discoveryRatio = Number.isFinite(Number(r.discoveryRatio))
    ? Number(r.discoveryRatio)
    : mode === 'discover' ? 1.0 : mode === 'mixed' ? 0.3 : 0
    
  const feedLimit = Number.isFinite(Number(r.feedLimit)) 
    ? Number(r.feedLimit) 
    : 10
    
  return { mode, discoveryRatio, feedLimit }
}

export async function getFeedSettings(force = false) {
  if (cache && !force) return cache

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'feed')
    .single()

  if (error) {
    console.log('No global settings found, using defaults')
    const local = JSON.parse(localStorage.getItem('feedAlgorithmSettings') || '{}')
    cache = normalize(local)
    return cache
  }

  cache = normalize(data?.value)
  // Keep a local copy for instant access
  localStorage.setItem('feedAlgorithmSettings', JSON.stringify(cache))
  return cache
}

export async function saveFeedSettings(newSettings) {
  const { data: { user } } = await supabase.auth.getUser()
  const value = normalize(newSettings)
  
  const { error } = await supabase
    .from('app_settings')
    .upsert({ 
      key: 'feed', 
      value, 
      updated_by: user?.id,
      updated_at: new Date().toISOString()
    })
    
  if (error) throw error
  
  cache = value
  localStorage.setItem('feedAlgorithmSettings', JSON.stringify(value))
  return value
}

// Optional: Real-time updates
export function subscribeToFeedSettings(onChange) {
  const channel = supabase
    .channel('app_settings_feed')
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'app_settings', 
        filter: 'key=eq.feed' 
      },
      async () => {
        const newSettings = await getFeedSettings(true)
        onChange(newSettings)
      }
    )
    .subscribe()
    
  return () => supabase.removeChannel(channel)
}