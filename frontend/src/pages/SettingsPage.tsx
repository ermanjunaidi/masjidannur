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
import { Loader2, Save, Building2, Tv, ExternalLink, Copy, Check } from "lucide-react"
import { ApiError, masjidSettingsApi } from "@/lib/api"
import type { MasjidSettings } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  Jakarta: { lat: -6.2088, lng: 106.8456 },
  Bandung: { lat: -6.9175, lng: 107.6191 },
  Surabaya: { lat: -7.2575, lng: 112.7521 },
  Semarang: { lat: -6.9667, lng: 110.4167 },
  Yogyakarta: { lat: -7.7956, lng: 110.3695 },
  Medan: { lat: 3.5952, lng: 98.6722 },
  Makassar: { lat: -5.1477, lng: 119.4327 },
  Palembang: { lat: -2.9761, lng: 104.7754 },
  Denpasar: { lat: -8.6705, lng: 115.2126 },
  Banjarmasin: { lat: -3.3194, lng: 114.5908 },
  Padang: { lat: -0.9471, lng: 100.4172 },
  Malang: { lat: -7.9797, lng: 112.6304 },
}

export default function SettingsPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("settings:write")

  const [settings, setSettings] = useState<MasjidSettings | null>(null)
  const [form, setForm] = useState({
    name: "",
    slug: "",
    city_name: "Jakarta",
    latitude: -6.2088,
    longitude: 106.8456,
    address: "",
    phone: "",
    email: "",
    currency_code: "Rp",
    report_footer: "",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    masjidSettingsApi
      .get()
      .then((data) => {
        if (cancelled) return
        setSettings(data)
        setForm({
          name: data.name ?? "",
          slug: data.slug ?? "",
          city_name: data.city_name || "Jakarta",
          latitude: data.latitude || -6.2088,
          longitude: data.longitude || 106.8456,
          address: data.address ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          currency_code: data.currency_code ?? "Rp",
          report_footer: data.report_footer ?? "",
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

  const handleCityChange = (cityName: string) => {
    const coords = CITY_COORDINATES[cityName]
    if (coords) {
      setForm((prev) => ({
        ...prev,
        city_name: cityName,
        latitude: coords.lat,
        longitude: coords.lng,
      }))
    } else {
      setForm((prev) => ({ ...prev, city_name: cityName }))
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await masjidSettingsApi.update(form)
      setSettings(updated)
      setSuccess("Profil dan pengaturan masjid berhasil disimpan")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan")
    } finally {
      setSaving(false)
    }
  }

  const displayUrl = settings?.slug
    ? `${window.location.origin}/display/${settings.slug}`
    : `${window.location.origin}/display`

  const handleCopyLink = () => {
    navigator.clipboard.writeText(displayUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
        <h1 className="text-2xl font-bold tracking-tight">Pengaturan Masjid</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Kelola profil masjid, koordinat jadwal shalat, dan konfigurasi Layar TV Masjid.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!settings ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Pengaturan masjid belum tersedia.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 max-w-3xl">
          {/* Card URL Layar TV Display */}
          <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Tv className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Layar TV Masjid (Public Display)</CardTitle>
                    <CardDescription>
                      Tampilkan jadwal shalat realtime, jadwal kajian, dan transparansi kas di TV masjid.
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Input
                  readOnly
                  value={displayUrl}
                  className="bg-background font-mono text-xs select-all"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                    className="gap-1.5"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Tersalin!" : "Salin Link"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => window.open(displayUrl, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Buka Display
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Buka link di atas pada Smart TV, Android Box, atau monitor masjid untuk mode layar penuh interaktif.
              </p>
            </CardContent>
          </Card>

          <form onSubmit={handleSave} className="space-y-4">
            {success && (
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                {success}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profil & Identitas Masjid</CardTitle>
                <CardDescription>
                  Nama dan alamat yang tampil pada struk, laporan kas, dan layar display.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Masjid</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      disabled={!canWrite}
                      placeholder="Masjid An-Nur"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Custom URL Slug (TV Display)</Label>
                    <div className="flex items-center rounded-md border border-input bg-background pl-3 focus-within:ring-1 focus-within:ring-ring">
                      <span className="text-xs text-muted-foreground select-none">/display/</span>
                      <input
                        id="slug"
                        className="flex-1 bg-transparent px-2 py-2 text-sm outline-none font-mono"
                        value={form.slug}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                          })
                        }
                        disabled={!canWrite}
                        placeholder="masjid-annur"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Nomor Telepon / WhatsApp</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      disabled={!canWrite}
                      placeholder="081234567890"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Pengurus</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      disabled={!canWrite}
                      placeholder="takmir@masjidannur.id"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Alamat Lengkap</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    disabled={!canWrite}
                    placeholder="Jl. Merdeka No. 123"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lokasi & Koordinat Jadwal Shalat</CardTitle>
                <CardDescription>
                  Digunakan untuk menghitung jadwal shalat astronomis otomatis sesuai posisi masjid.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Kota / Wilayah Terdekat</Label>
                  <select
                    id="city"
                    value={form.city_name}
                    onChange={(e) => handleCityChange(e.target.value)}
                    disabled={!canWrite}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {Object.keys(CITY_COORDINATES).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="latitude">Latitude (Garis Lintang)</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) =>
                        setForm({ ...form, latitude: parseFloat(e.target.value) || 0 })
                      }
                      disabled={!canWrite}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="longitude">Longitude (Garis Bujur)</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) =>
                        setForm({ ...form, longitude: parseFloat(e.target.value) || 0 })
                      }
                      disabled={!canWrite}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Format Laporan & Transaksi</CardTitle>
                <CardDescription>Pengaturan footer cetak laporan dan simbol mata uang.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="currency">Simbol Mata Uang</Label>
                    <Input
                      id="currency"
                      value={form.currency_code}
                      onChange={(e) => setForm({ ...form, currency_code: e.target.value })}
                      disabled={!canWrite}
                      placeholder="Rp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="footer">Footer Laporan / Pesan Berjalan</Label>
                    <Input
                      id="footer"
                      value={form.report_footer}
                      onChange={(e) => setForm({ ...form, report_footer: e.target.value })}
                      disabled={!canWrite}
                      placeholder="Jazakumullahu khairan atas infak & sedekah Anda..."
                    />
                  </div>
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
                      Simpan Pengaturan
                    </>
                  )}
                </Button>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
