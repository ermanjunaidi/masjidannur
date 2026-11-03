import { useCallback, useEffect, useRef, useState } from "react"
import { Navigate } from "react-router"
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
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  HardDrive,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react"
import { tokenStore } from "@/lib/api"
import { useAuth } from "@/context/AuthContext"

// Backup & restore seluruh database + file upload (gambar). Hanya untuk
// superadmin platform (organization 0) — backend menolak selain itu.

const API_URL = import.meta.env.VITE_API_URL ?? ""
const CONFIRM_WORD = "RESTORE"

interface Snapshot {
  name: string
  size: number
  created_at: string
}

interface RestoreResult {
  app: string
  backup_created_at: string
  tables: number
  rows: number
  files: number
  safety_snapshot: string
  warnings: string[]
}

async function backupFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
  const token = tokenStore.get()
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(`${API_URL}/api/backup${path}`, { ...init, headers })
  if (!res.ok) {
    let msg = `Request gagal (${res.status})`
    if (res.status === 413) msg = "File terlalu besar untuk diunggah lewat browser"
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      /* non-JSON body */
    }
    throw new Error(msg)
  }
  return res
}

async function downloadFrom(path: string, fallbackName: string) {
  const res = await backupFetch(path)
  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = match?.[1] ?? fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function fetchSnapshots(): Promise<Snapshot[]> {
  const res = await backupFetch("/snapshots")
  const body = (await res.json()) as { data: Snapshot[] }
  return body.data ?? []
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
}

export default function BackupPage() {
  const { user, logout } = useAuth()
  const isPlatform =
    !!user && (user.organization_id ?? 0) === 0 && (user.roles?.some((r) => r.name === "superadmin") ?? false)

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const [pendingSnapshot, setPendingSnapshot] = useState<string | null>(null)
  const [result, setResult] = useState<RestoreResult | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const loadSnapshots = useCallback(async () => {
    setSnapshots(await fetchSnapshots())
  }, [])

  useEffect(() => {
    if (!isPlatform) return
    let active = true
    fetchSnapshots()
      .then((list) => active && setSnapshots(list))
      .catch((err) => active && setError(err instanceof Error ? err.message : "Gagal memuat daftar backup"))
    return () => {
      active = false
    }
  }, [isPlatform])

  if (!isPlatform) return <Navigate to="/admin" replace />

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan")
    } finally {
      setBusy(null)
    }
  }

  const handleExport = () =>
    run("export", async () => {
      await downloadFrom("/export", "backup.zip")
      setNotice("Backup berhasil diunduh.")
    })

  const handleCreateSnapshot = () =>
    run("snapshot", async () => {
      await backupFetch("/snapshots", { method: "POST" })
      await loadSnapshots()
      setNotice("Backup tersimpan di server.")
    })

  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD

  const finishRestore = async (res: Response) => {
    setResult((await res.json()) as RestoreResult)
    setFile(null)
    setConfirmText("")
    setPendingSnapshot(null)
    if (fileInput.current) fileInput.current.value = ""
  }

  const handleImport = () =>
    run("import", async () => {
      if (!file) throw new Error("Pilih file backup (.zip) terlebih dahulu")
      const form = new FormData()
      form.append("file", file)
      await finishRestore(await backupFetch("/import", { method: "POST", body: form }))
    })

  const handleRestoreSnapshot = (name: string) =>
    run(`restore:${name}`, async () => {
      await finishRestore(await backupFetch(`/snapshots/${encodeURIComponent(name)}/restore`, { method: "POST" }))
    })

  const handleDeleteSnapshot = (name: string) => {
    if (!window.confirm(`Hapus backup ${name} dari server?`)) return
    run(`delete:${name}`, async () => {
      await backupFetch(`/snapshots/${encodeURIComponent(name)}`, { method: "DELETE" })
      await loadSnapshots()
    })
  }

  const relogin = () => {
    logout()
    window.location.href = "/login"
  }

  if (result) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Backup &amp; Restore</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Restore berhasil
            </CardTitle>
            <CardDescription>
              Data dari backup tanggal {formatDate(result.backup_created_at)} sudah dipulihkan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-1">
              <li>{result.tables} tabel, {result.rows.toLocaleString("id-ID")} baris data</li>
              <li>{result.files} file gambar/upload</li>
              <li>
                Kondisi sebelum restore disimpan sebagai <code className="font-mono">{result.safety_snapshot}</code>{" "}
                (bisa dipulihkan dari daftar backup di server).
              </li>
            </ul>
            {result.warnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-medium">Catatan:</p>
                <ul className="list-disc pl-5">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-muted-foreground">
              Data akun ikut terganti, jadi sesi ini harus login ulang.
            </p>
            <Button onClick={relogin}>Login ulang</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backup &amp; Restore</h1>
        <p className="text-muted-foreground">
          Export dan import seluruh database beserta gambar yang diunggah.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" /> Export
            </CardTitle>
            <CardDescription>
              Unduh satu file .zip berisi semua tabel database dan semua gambar (folder uploads).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={handleExport} disabled={busy !== null}>
              {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Unduh backup
            </Button>
            <Button variant="outline" onClick={handleCreateSnapshot} disabled={busy !== null}>
              {busy === "snapshot" ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
              Simpan di server
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Import
            </CardTitle>
            <CardDescription>Pulihkan dari file backup .zip aplikasi ini.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Semua data dan gambar saat ini akan <b>diganti</b> isi backup. Sebelum restore, server otomatis
                menyimpan backup kondisi sekarang.
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="backup-file">File backup</Label>
              <Input
                id="backup-file"
                ref={fileInput}
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backup-confirm">
                Ketik <span className="font-mono font-semibold">{CONFIRM_WORD}</span> untuk konfirmasi
              </Label>
              <Input
                id="backup-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button
              variant="destructive"
              onClick={handleImport}
              disabled={busy !== null || !file || !confirmed || pendingSnapshot !== null}
            >
              {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import &amp; ganti data
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5" /> Backup di server
          </CardTitle>
          <CardDescription>
            Tersimpan di folder <code className="font-mono">backend/backups</code>. Backup otomatis sebelum restore
            (pre-restore) disimpan 5 terakhir. File besar (&gt;100 MB) bisa disalin manual ke folder ini lalu
            dipulihkan dari sini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada backup di server.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {snapshots.map((s) => (
                <div key={s.name} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(s.created_at)} · {formatSize(s.size)}
                    </p>
                  </div>
                  {pendingSnapshot === s.name ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="h-8 w-32"
                        placeholder={CONFIRM_WORD}
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        autoComplete="off"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!confirmed || busy !== null}
                        onClick={() => handleRestoreSnapshot(s.name)}
                      >
                        {busy === `restore:${s.name}` && <Loader2 className="h-4 w-4 animate-spin" />}
                        Pulihkan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => {
                          setPendingSnapshot(null)
                          setConfirmText("")
                        }}
                      >
                        Batal
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`download:${s.name}`, () =>
                            downloadFrom(`/snapshots/${encodeURIComponent(s.name)}`, s.name),
                          )
                        }
                      >
                        {busy === `download:${s.name}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Unduh
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => {
                          setPendingSnapshot(s.name)
                          setConfirmText("")
                        }}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Pulihkan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => handleDeleteSnapshot(s.name)}
                        title="Hapus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
