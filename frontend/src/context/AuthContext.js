import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext({})
export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rechecking, setRechecking] = useState(false)

  // Guards to prevent stale updates & duplicate profile loads
  const mountedRef = useRef(false)
  const lastUserIdRef = useRef(null)
  const profileSeqRef = useRef(0)
  const recheckInFlightRef = useRef(false)
  const recheckTimeoutRef = useRef(null)
  const sessionExpRef = useRef(null)  // NEW: Track token expiry

  useEffect(() => {
    mountedRef.current = true

    let resolved = false
    const resolveLoadingOnce = () => {
      if (!resolved && mountedRef.current) {
        resolved = true
        setLoading(false)
      }
    }

    // 1) Subscribe to auth changes (handles SIGNED_IN/OUT and keeps user fresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return
      
      // NEW: Store token expiry time
      sessionExpRef.current = session?.expires_at ?? null
      
      // Keep user object fresh for TOKEN_REFRESHED too
      const nextUser = session?.user ?? null
      setUser(nextUser)

      const nextUserId = nextUser?.id || null
      if (nextUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = nextUserId
        if (!nextUserId) {
          setProfile(null)
        } else {
          loadProfileLatest(nextUserId)
        }
      }

      // If we were in a refocus hold, end it as soon as auth resolves either way
      if (recheckInFlightRef.current &&
          (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED')) {
        recheckInFlightRef.current = false
        setRechecking(false)
        if (recheckTimeoutRef.current) {
          clearTimeout(recheckTimeoutRef.current)
          recheckTimeoutRef.current = null
        }
      }

      // No matter what the event is, the app can render now
      resolveLoadingOnce()
    })

    // 2) Seed state with current session (and also resolve loading)
    const timeoutId = setTimeout(resolveLoadingOnce, 2000) // fallback so we never hang
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mountedRef.current) return
        
        // NEW: Store token expiry time
        sessionExpRef.current = session?.expires_at ?? null
        
        const nextUser = session?.user ?? null
        setUser(nextUser)

        const nextUserId = nextUser?.id || null
        if (nextUserId !== lastUserIdRef.current) {
          lastUserIdRef.current = nextUserId
          if (!nextUserId) {
            setProfile(null)
          } else {
            loadProfileLatest(nextUserId)
          }
        }
      })
      .catch(err => {
        console.error('getSession error:', err)
      })
      .finally(() => {
        clearTimeout(timeoutId)
        resolveLoadingOnce()
      })

    // 3) SMART REFOCUS: Only hold UI when token is expiring or no user
    const kickRefocusRecheck = async () => {
      if (!mountedRef.current || recheckInFlightRef.current) return
      
      // Check if we actually need to refresh
      const now = Math.floor(Date.now() / 1000)
      const exp = sessionExpRef.current
      const nearExpiry = exp ? (exp - now) <= 30 : !user
      
      // If user exists and token isn't expiring, skip the refresh
      if (user && !nearExpiry) return
      
      recheckInFlightRef.current = true
      setRechecking(true)
      
      try {
        // Seed from local session quickly (do NOT force user to null here)
        const { data: { session } } = await supabase.auth.getSession()
        sessionExpRef.current = session?.expires_at ?? sessionExpRef.current
        const localUser = session?.user
        if (localUser) {
          setUser(prev => prev || localUser) // don't overwrite a non-null user
          const uid = localUser.id
          if (uid && uid !== lastUserIdRef.current) {
            lastUserIdRef.current = uid
            await loadProfileLatest(uid)
          }
        }
      } catch (e) {
        console.warn('refocus getSession error:', e)
      } finally {
        // Fail-safe: if no auth event arrives quickly, end the hold
        recheckTimeoutRef.current = setTimeout(() => {
          recheckInFlightRef.current = false
          setRechecking(false)
          recheckTimeoutRef.current = null
        }, 800)
      }
    }

    // Simplified event handlers (removed focus listener)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') kickRefocusRecheck()
    }
    
    const onPageShow = (e) => {
      // Only trigger on bfcache restore or if no user
      if ((e && e.persisted) || !user) kickRefocusRecheck()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    // NOTE: No focus listener - it fires too often

    // Proper cleanup (no Promise returns)
    return () => {
      mountedRef.current = false
      subscription?.unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      if (recheckTimeoutRef.current) {
        clearTimeout(recheckTimeoutRef.current)
        recheckTimeoutRef.current = null
      }
    }
  }, [])

  // ---- Profile helpers (latest-only) ----
  const loadProfileLatest = async (userId) => {
    const seq = ++profileSeqRef.current
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (!mountedRef.current || profileSeqRef.current !== seq) return

      if (error?.code === 'PGRST116') {
        const created = await createProfile(userId)
        if (!mountedRef.current || profileSeqRef.current !== seq) return
        setProfile(created)
      } else if (data) {
        setProfile(data)
      } else {
        setProfile(null)
      }
    } catch (e) {
      if (!mountedRef.current || profileSeqRef.current !== seq) return
      console.error('loadProfile error:', e)
      setProfile(null)
    }
  }

  const createProfile = async (userId) => {
    try {
      const { data: u } = await supabase.auth.getUser()
      const metadata = u?.user?.user_metadata || {}

      const newProfile = {
        id: userId,
        username: metadata.username || null,
        full_name: metadata.full_name || null,
        avatar_url: metadata.avatar_url || null,
        phone: u?.user?.phone || null,
        created_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('profiles')
        .insert([newProfile])
        .select()
        .single()

      if (error) {
        console.error('Error creating profile:', error)
        return null
      }
      return data
    } catch (err) {
      console.error('createProfile error:', err)
      return null
    }
  }

  // Exposed manual refresh (also latest-only guarded)
  const loadProfile = async (userId) => loadProfileLatest(userId)

  const updateProfile = async (updates) => {
    try {
      if (!user?.id) throw new Error('Not signed in')
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error
      setProfile(data)
      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  // ---- Auth actions ----
  const signUp = async (email, password, metadata = {}) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata, emailRedirectTo: window.location.origin }
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  const signInWithPhone = async (phone) => {
    try {
      const { data, error } = await supabase.auth.signInWithOtp({ phone })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  const verifyPhoneOTP = async (phone, token) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  const signInWithGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (!error) {
        lastUserIdRef.current = null
        setUser(null)
        setProfile(null)
      }
      return { error }
    } catch (error) {
      return { error }
    }
  }

  const resetPassword = async (email) => {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  const updatePassword = async (newPassword) => {
    try {
      const { data, error } = await supabase.auth.updateUser({ password: newPassword })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  // CRITICAL FIX: Include rechecking in dependencies!
  const value = useMemo(() => ({
    user,
    profile,
    loading,
    rechecking,
    signUp,
    signIn,
    signInWithPhone,
    verifyPhoneOTP,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    loadProfile,
  }), [user, profile, loading, rechecking])  // ← FIX: Added rechecking

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}