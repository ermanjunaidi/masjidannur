import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useAuth } from "@/context/AuthContext"
import { authApi, fetchGoogleEnabled } from "@/lib/api"
import { Moon, Loader2, Eye, EyeOff, Check } from "lucide-react"

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  // Backend mengarahkan ke /register?google_error=... kalau "Masuk dengan
  // Google" dipakai untuk akun yang belum terdaftar.
  const [error, setError] = useState(() => searchParams.get("google_error") ?? "")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchGoogleEnabled().then(setGoogleEnabled)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name || !email || !password || !confirmPassword) {
      setError("Mohon lengkapi semua kolom")
      return
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok")
      return
    }
    if (password.length < 8) {
      setError("Password minimal 8 karakter")
      return
    }

    setLoading(true)
    try {
      await register(name, email, password)
      navigate("/admin")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registrasi gagal")
    } finally {
      setLoading(false)
    }
  }

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
          Masjid<span className="text-primary">Hub</span>
        </span>
      </Link>

      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Buat Akun MasjidHub</CardTitle>
          <CardDescription>
            Daftar gratis — Anda otomatis menjadi <b>Admin</b> masjid Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Nama / Nama Masjid</Label>
              <Input
                id="name"
                type="text"
                placeholder="Masjid Aneka Amal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="masjid@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {[
                "Akses penuh sebagai Admin masjid",
                "Kelola buku kas, kategori & transaksi",
                "Gratis — tanpa kartu kredit",
              ].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" /> {t}
                </li>
              ))}
            </ul>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Membuat akun...
                </>
              ) : (
                "Daftar Gratis"
              )}
            </Button>

            {googleEnabled && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">atau</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => { window.location.href = authApi.googleAuthUrl("register") }}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.35 11.1H12v3.2h5.36c-.45 2.28-2.46 3.6-5.36 3.6-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8c1.5 0 2.9.55 3.97 1.46l2.4-2.4A9.1 9.1 0 0 0 12 3.2c-4.9 0-8.8 3.9-8.8 8.8s3.9 8.8 8.8 8.8c5.1 0 8.4-3.6 8.4-8.8 0-.6-.05-1.1-.15-1.5z" />
                  </svg>
                  Daftar dengan Google
                </Button>
              </>
            )}

            <p className="text-center text-sm text-muted-foreground">
              Sudah punya akun?{" "}
              <Link
                to="/login"
                className="font-medium text-primary hover:underline"
              >
                Masuk
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
