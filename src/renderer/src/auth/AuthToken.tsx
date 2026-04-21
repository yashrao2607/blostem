import { useEffect } from 'react'
import { useAuthStore } from '../store/auth-store'
import { supabase } from '@renderer/config/supabase'
import { ensureCloudUserProfile, fetchCloudUserProfile } from '@renderer/services/cloud-auth'

export default function AuthInitializer() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken)
  const setUser = useAuthStore((s) => s.setUser)
  const setIsAuthInitialized = useAuthStore((s: any) => s.setIsAuthInitialized)

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession()

        const accessToken = session?.access_token || null
        setAccessToken(accessToken)

        if (session?.user?.id) {
          try {
            await ensureCloudUserProfile(session.user)
          } catch {
          }

          const profile = await fetchCloudUserProfile(session.user.id)
          if (profile) {
            setUser(profile)
          } else {
            setUser({
              id: session.user.id,
              name: (session.user.user_metadata?.full_name as string) || 'ELI User',
              email: session.user.email || 'Not linked',
              tier: 'FREE',
              status: 'approved' as const,
              verified: session.user.email_confirmed_at != null
            })
          }
        } else {
          setUser(null)
        }
      } catch (err) {
        setAccessToken(null)
        setUser(null)
      } finally {
        if (setIsAuthInitialized) setIsAuthInitialized(true)
      }
    }

    init()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.id) {
        try {
          await ensureCloudUserProfile(session.user)
        } catch {
        }
      }

      // Only update the token if Supabase is providing a new value; don't
      // overwrite a token we already set from completeOAuthFromDeepLink.
      const incoming = session?.access_token || null
      if (incoming !== null || useAuthStore.getState().accessToken === null) {
        setAccessToken(incoming)
      }

      if (session?.user?.id) {
        try {
          const profile = await fetchCloudUserProfile(session.user.id)
          if (profile) {
            setUser(profile)
          } else {
            setUser({
              id: session.user.id,
              name: (session.user.user_metadata?.full_name as string) || 'ELI User',
              email: session.user.email || 'Not linked',
              tier: 'FREE',
              status: 'approved' as const,
              verified: session.user.email_confirmed_at != null
            })
          }
        } catch {
          // Profile fetch failure is non-fatal; user is still authenticated.
        }
      } else {
        setUser(null)
      }

      if (setIsAuthInitialized) setIsAuthInitialized(true)
    })

    return () => subscription.unsubscribe()
  }, [setAccessToken, setIsAuthInitialized, setUser])

  return null
}
