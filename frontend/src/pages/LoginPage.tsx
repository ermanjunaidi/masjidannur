import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useAuth } from "@/context/AuthContext"
import { authApi } from "@/lib/api"
import { Moon, Loader2, Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  const { login, loginWithToken } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Google OAuth callback: ?google_token=...
  useEffect(() => {
    const t = searchParams.get("google_token")
    if (t) {
      setLoading(true)
      setError("")
      loginWithToken(t)
        .then(() => navigate("/admin", { replace: true }))
        .catch((e) => setError(e instanceof Error ? e.message : "Google login gagal"))
        .finally(() => setLoading(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!email || !password) {
      setError("Mohon isi email dan password")
      return
    }
    setLoading(true)
    try {
      await login(email, password)
      navigate("/admin")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal")
    } finally {
      setLoading(false)
    }
  }

  const googleDisabled = false // handled by backend 503 if unconfigured

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 px-4">
      <Link
        to="/"
        className="flex items-center gap-2 font-bold text-xl mb-6 hover:opacity-80 transition-opacity"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Moon className="h-4.5 w-4.5" />
        </span>
        <span>
          Buku<span className="text-primary">Masjid</span>
        </span>
      </Link>

      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Masuk ke Buku Masjid</CardTitle>
          <CardDescription>Kelola keuangan masjid Anda dari mana saja</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Lupa password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                "Masuk"
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">atau</span>
            </div>
          </div>

          {/* Google */}
          <Button
            variant="outline"
            className="w-full"
            disabled={googleDisabled}
            onClick={() => {
              window.location.href = authApi.googleAuthUrl()
            }}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21.35 11.1H12v3.2h5.36c-.45 2.28-2.46 3.6-5.36 3.6-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8c1.5 0 2.9.55 3.97 1.46l2.4-2.4A9.1 9.1 0 0 0 12 3.2c-4.9 0-8.8 3.9-8.8 8.8s3.9 8.8 8.8 8.8c5.1 0 8.4-3.6 8.4-8.8 0-.6-.05-1.1-.15-1.5z" />
            </svg>
            Masuk dengan Google
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Belum punya akun?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Daftar Gratis
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
