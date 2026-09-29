import { useEffect, useState } from "react"
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
import { Loader2, Save, Building2 } from "lucide-react"
import { ApiError, organizationApi } from "@/lib/api"
import type { Organization } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"

export default function SettingsPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("settings:write")

  const [org, setOrg] = useState<Organization | null>(null)
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    organizationApi
      .get()
      .then((data) => {
        if (cancelled) return
        setOrg(data)
        setForm({
          name: data.name ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          address: data.address ?? "",
        })
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof ApiError ? e.message : "Gagal memuat pengaturan")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await organizationApi.update(form)
      setOrg(updated)
      setSuccess("Profil bengkel berhasil disimpan")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pengaturan Bengkel</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Informasi profil bengkel yang ditampilkan di sistem.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!org ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Akun ini tidak terhubung ke organisasi bengkel mana pun
              (platform-level). Daftarkan akun bengkel untuk mengelola profil.
            </p>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSave} className="max-w-2xl space-y-4">
          {success && (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              {success}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profil Bengkel</CardTitle>
              <CardDescription>
                Nama dan kontak yang tampil untuk bengkel Anda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Bengkel</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={!canWrite}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telepon</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={!canWrite}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={!canWrite}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Alamat</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  disabled={!canWrite}
                />
              </div>
            </CardContent>
          </Card>

          {canWrite && (
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Simpan
                  </>
                )}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}