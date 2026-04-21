import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface CloudUserProfile {
  id: string
  name: string
  email: string
  tier: 'FREE' | 'PRO'
  status: 'pending' | 'approved' | 'rejected'
  verified: boolean
}

interface AuthState {
  accessToken: string | null
  isAuthInitialized: boolean
  user: CloudUserProfile | null

  setAccessToken: (token: string | null) => void
  setIsAuthInitialized: (value: boolean) => void
  setUser: (user: CloudUserProfile | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  immer((set) => ({
    accessToken: null,
    isAuthInitialized: false,
    user: null,

    setAccessToken: (token) =>
      set((state) => {
        state.accessToken = token
      }),

    setIsAuthInitialized: (value) =>
      set((state) => {
        state.isAuthInitialized = value
      }),

    setUser: (user) =>
      set((state) => {
        state.user = user
      }),

    logout: () =>
      set((state) => {
        state.accessToken = null
        state.user = null
        state.isAuthInitialized = true
      })
  }))
)
