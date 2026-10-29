import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authService } from '../services/authService'
import { isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export const homeForRole = (role) => ({ ADMIN: '/admin', LECTURER: '/lecturer', STUDENT: '/student' }[role] || '/login')

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [profileError, setProfileError] = useState(null)

  const loadProfile = useCallback(async (u) => {
    if (!u) { setProfile(null); setProfileError(null); return }
    try {
      const p = await authService.getProfile(u.id)
      setProfile(p); setProfileError(p ? null : 'No profile found for this account.')
    } catch (e) { setProfile(null); setProfileError(e.message) }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    let active = true
    authService.getCurrentUser().then(async (u) => {
      if (!active) return
      setUser(u); await loadProfile(u); if (active) setLoading(false)
    }).catch(() => active && setLoading(false))
    const { data } = authService.onAuthStateChange((_evt, session) => {
      // never await supabase calls inside this callback (can deadlock the client); defer instead
      setTimeout(async () => {
        if (!active) return
        setUser(session?.user ?? null); await loadProfile(session?.user ?? null); if (active) setLoading(false)
      }, 0)
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [loadProfile])

  const value = useMemo(() => ({
    user, profile, loading, profileError,
    role: profile?.is_active ? profile.role : null,
    signIn: async (email, password) => { await authService.signIn(email, password) },
    signOut: async () => { await authService.signOut(); setUser(null); setProfile(null) },
    hasRole: (roles) => Boolean(profile?.is_active && roles.includes(profile.role)),
    reloadProfile: () => loadProfile(user),
  }), [user, profile, loading, profileError, loadProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
