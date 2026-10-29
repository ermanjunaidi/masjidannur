import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import { ApiError, authApi, tokenStore, userStore } from "@/lib/api"
import type { User } from "@/lib/types"

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isAdmin: boolean
  /** True while the initial /me probe is in flight. */
  hydrating: boolean
  /** True once a hydrate probe has finished (regardless of result). */
  hydrated: boolean
  /** Keeps the user record fresh — call after any admin mutation. */
  refresh: () => Promise<void>
  hasPermission: (key: string) => boolean
  hasRole: (name: string) => boolean
  setSession: (token: string, user: User) => void
  clearSession: () => void
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  loginWithToken: (token: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  // Session is read synchronously from localStorage so the first render
  // already knows whether the user is logged in.
  const [user, setUser] = useState<User | null>(() =>
    tokenStore.get() ? userStore.get() : null,
  )
  const [token, setToken] = useState<string | null>(() =>
    userStore.get() ? tokenStore.get() : null,
  )
  // Kept for API compatibility: the session is restored synchronously, so
  // there is no hydrating phase any more.
  const hydrating = false
  const hydrated = true

  const setSession = useCallback((t: string, u: User) => {
    setToken(t)
    setUser(u)
    tokenStore.set(t)
    userStore.set(u)
  }, [])

  const clearSession = useCallback(() => {
    setToken(null)
    setUser(null)
    tokenStore.clear()
    userStore.clear()
  }, [])

  // ─── Hydrate from localStorage + /api/auth/me probe ────────────────────────
  // Reading localStorage first keeps the UI snappy on cold load. The /me
  // probe then guarantees the roles/permissions array mirrors the DB so
  // admin-side mutations made in another tab become visible without a
  // manual re-login.
  useEffect(() => {
    if (!token) return
    let cancelled = false

    // Probe /me in the background; if it fails (401/expired) we drop the
    // session so the user is sent back to login on the next navigation.
    authApi
      .me()
      .then((fresh) => {
        if (cancelled) return
        if (fresh && typeof fresh === "object" && "id" in fresh) {
          const userWithRoles = { ...fresh, roles: fresh.roles ?? [] }
          setUser(userWithRoles)
          userStore.set(userWithRoles)
        } else {
          clearSession()
        }
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          clearSession()
        }
        // For non-auth errors we keep the cached user — backend may be
        // temporarily down — so the UI remains usable offline-friendly.
      })

    return () => {
      cancelled = true
    }
    // Only on mount: later logins already carry a fresh user record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasPermission = useCallback(
    (key: string) =>
      user?.roles?.some((r) => r.permissions?.some((p) => p.key === key)) ?? false,
    [user],
  )
  const hasRole = useCallback(
    (name: string) => user?.roles?.some((r) => r.name === name) ?? false,
    [user],
  )

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password)
    setSession(data.token, data.user)
  }, [setSession])

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await authApi.register(name, email, password)
      setSession(data.token, data.user)
    },
    [setSession],
  )

  /** Session bootstrap from an external token (Google OAuth callback). */
  const loginWithToken = useCallback(
    async (t: string) => {
      // Store first so the /me probe has an Authorization header.
      tokenStore.set(t)
      try {
        const fresh = await authApi.me()
        const userWithRoles = { ...fresh, roles: fresh.roles ?? [] }
        setSession(t, userWithRoles)
      } catch {
        tokenStore.clear()
        userStore.clear()
        throw new Error("Sesi tidak valid")
      }
    },
    [setSession],
  )

  const logout = useCallback(() => {
    clearSession()
  }, [clearSession])

  const refresh = useCallback(async () => {
    try {
      const fresh = await authApi.me()
      setUser(fresh)
      userStore.set(fresh)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        clearSession()
      }
      // Surface as a toast in consumer; here we just swallow 5xx.
    }
  }, [clearSession])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        // Derived from a real permissions array, not the legacy string.
        // A role called "admin" still maps cleanly because admins hold
        // every seeded permission by default (see bootstrapRBAC).
        isAdmin: user?.roles?.some((r) => r.name === "admin") ?? false,
        hydrating,
        hydrated,
        refresh,
        hasPermission,
        hasRole,
        setSession,
        clearSession,
        login,
        register,
        loginWithToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
