import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const currentUserRef = useRef(null) // ADD THIS

// Add this effect to keep the ref updated
useEffect(() => {
  currentUserRef.current = user
}, [user])

  useEffect(() => {
  let mounted = true;
  
  // Set up auth listener
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (!mounted) return;
    
    console.log('Auth state change:', event);
    
    if (event === 'TOKEN_REFRESHED') {
      return;
    }
    
    if (event === 'SIGNED_OUT') {
      setUser(null);
      setProfile(null);
      setLoading(false);
    } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      // Set user immediately
      setUser(session?.user ?? null);
      
      // Load profile but don't block on it
      if (session?.user) {
        loadProfile(session.user.id).catch(err => {
          console.error('Profile load error:', err);
        });
      }
      
      // ALWAYS set loading to false, don't wait for profile
      setLoading(false);
    } else if (event === 'USER_UPDATED') {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).catch(err => {
          console.error('Profile load error:', err);
        });
      }
      setLoading(false);
    }
  });

  // Trigger session check
  supabase.auth.getSession().catch(() => {
    // Ignore errors, the listener handles everything
  });

  return () => {
    mounted = false;
    subscription.unsubscribe();
  };
}, []);


  // Load user profile from database
  const loadProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist, create one
      const newProfile = await createProfile(userId)
      setProfile(newProfile)
    } else if (data) {
      setProfile(data)
    } else {
      // No profile and no specific error - set to null
      setProfile(null)
    }
  } catch (error) {
    console.error('Error loading profile:', error)
    setProfile(null)  // Set to null on any error
  }
}

  // Create initial profile for new users
  const createProfile = async (userId) => {
    const user = await supabase.auth.getUser()
    const metadata = user.data.user?.user_metadata

    const newProfile = {
      id: userId,
      username: metadata?.username || null,
      full_name: metadata?.full_name || null,
      avatar_url: metadata?.avatar_url || null,
      phone: user.data.user?.phone || null,
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
  }

  // Update user profile
  const updateProfile = async (updates) => {
    try {
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

  // Sign up with email/password
  const signUp = async (email, password, metadata = {}) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata, // username, full_name, etc.
          emailRedirectTo: window.location.origin
        }
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Sign in with email/password
  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Sign in with phone number (SMS)
  const signInWithPhone = async (phone) => {
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        phone: phone // format: '+1234567890'
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Verify phone OTP
  const verifyPhoneOTP = async (phone, token) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: phone,
        token: token,
        type: 'sms'
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            prompt: 'select_account'
          }
        }
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Sign in with Apple (commented out - requires Apple Developer account)
  /*
  const signInWithApple = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: window.location.origin
        }
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }
  */

  // Sign out
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (!error) {
        setUser(null)
        setProfile(null)
      }
      return { error }
    } catch (error) {
      return { error }
    }
  }

  // Reset password
  const resetPassword = async (email) => {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`  // FIXED
    })
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

  // Update password
  const updatePassword = async (newPassword) => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInWithPhone,
    verifyPhoneOTP,
    signInWithGoogle,
    // signInWithApple, // Commented out - not implemented
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    loadProfile
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}