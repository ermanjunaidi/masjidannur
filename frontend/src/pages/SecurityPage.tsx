import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, KeyRound, ShieldCheck, Eye, EyeOff } from "lucide-react"
import { ApiError, authApi } from "@/lib/api"
import { useAuth } from "@/context/AuthContext"

export default function SecurityPage() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!currentPassword || !newPassword) {
      setError("Mohon isi password saat ini dan password baru")
      return
    }
    if (newPassword.length < 8) {
      setError("Password baru minimal 8 karakter")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak cocok")
      return
    }
    setLoading(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setSuccess("Password berhasil diubah")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Keamanan</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Kelola password dan lihat informasi akun Anda.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Info Akun
            </CardTitle>
            <CardDescription>Detail akun yang sedang masuk.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Nama</span>
              <span className="font-medium">{user?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email ?? "—"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Peran</span>
              <span className="flex flex-wrap justify-end gap-1">
                {(user?.roles?.length ?? 0) === 0 ? (
                  <span className="text-muted-foreground">no role</span>
                ) : (
                  user!.roles.map((r) => (
                    <Badge key={r.id} variant="outline">
                      {r.name}
                    </Badge>
                  ))
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jumlah Permission</span>
              <span className="font-medium">
                {(user?.roles ?? []).reduce((sum, r) => sum + (r.permissions?.length ?? 0), 0)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Change password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" />
              Ganti Password
            </CardTitle>
            <CardDescription>
              Gunakan password baru minimal 8 karakter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                  {success}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="current-password">Password Saat Ini</Label>
                <Input
                  id="current-password"
                  type={showPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">Password Baru</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Tampilkan password"
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
                <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  "Ubah Password"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}