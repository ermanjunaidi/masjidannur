// Audit Log — siapa melakukan apa dan kapan. Dicatat otomatis oleh server
// untuk setiap perubahan data, export, dan percobaan login; hanya bisa
// dibaca (tidak ada edit/hapus).

import { useCallback, useEffect, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ModalShell } from "@/components/UserModal"
import { Pagination } from "@/components/ui/pagination"
import { Loader2, RefreshCw, Search } from "lucide-react"
import { ApiError, auditApi } from "@/lib/api"
import type { AuditLog } from "@/lib/types"

const selectClass = "h-9 rounded-lg border bg-background px-3 text-sm"

const RESOURCES: Record<string, string> = {
  auth: "Login & Akun",
  books: "Buku Kas",
  categories: "Kategori",
  transactions: "Transaksi",
  distributions: "Pembagian Warga",
  residents: "Daftar Warga",
  lecturings: "Jadwal Pengajian",
  "masjid-settings": "Settings",
  users: "Users",
  roles: "Roles",
  backup: "Backup & Restore",
}

const ACTIONS: Record<string, { label: string; tone: "green" | "blue" | "red" | "gray" | "amber" }> = {
  create: { label: "Tambah", tone: "green" },
  update: { label: "Ubah", tone: "blue" },
  delete: { label: "Hapus", tone: "red" },
  import: { label: "Import", tone: "green" },
  export: { label: "Export", tone: "gray" },
  login: { label: "Login", tone: "gray" },
  login_failed: { label: "Login gagal", tone: "amber" },
  register: { label: "Daftar", tone: "green" },
  password: { label: "Ganti password", tone: "blue" },
  "forgot-password": { label: "Lupa password", tone: "amber" },
  "reset-password": { label: "Reset password", tone: "blue" },
  invite: { label: "Kirim undangan", tone: "blue" },
}

const TONES = {
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  blue: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  red: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  gray: "bg-muted text-muted-foreground border-border",
}

const resourceLabel = (r: string) => RESOURCES[r] ?? r
const actionInfo = (a: string) => ACTIONS[a] ?? { label: a, tone: "gray" as const }

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/** Detail (JSON) sebagai pasangan kunci–nilai yang mudah dibaca. */
function detailEntries(detail: string): [string, string][] | null {
  if (!detail) return []
  try {
    const data: unknown = JSON.parse(detail)
    if (data === null || typeof data !== "object" || Array.isArray(data)) return null
    return Object.entries(data as Record<string, unknown>).map(([k, v]) => [
      k,
      typeof v === "object" && v !== null ? JSON.stringify(v) : String(v),
    ])
  } catch {
    return null
  }
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [resource, setResource] = useState("")
  const [action, setAction] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState<AuditLog | null>(null)

  // Pencarian dikirim ke server setelah berhenti mengetik sebentar.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await auditApi.list({ from, to, resource, action, q: search, page, page_size: pageSize })
      setLogs(r.logs ?? [])
      setTotal(r.total)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat audit log")
    } finally {
      setLoading(false)
    }
  }, [from, to, resource, action, search, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  const entries = selected ? detailEntries(selected.detail) : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catatan siapa menambah, mengubah, menghapus, meng-export data, dan login. Dicatat
            otomatis dan tidak bisa diubah.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Aktivitas ({total})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari user atau isi perubahan..."
                className="pl-8"
              />
            </div>
            <select
              className={selectClass}
              value={resource}
              onChange={(e) => {
                setResource(e.target.value)
                setPage(1)
              }}
              aria-label="Filter menu"
            >
              <option value="">Semua menu</option>
              {Object.entries(RESOURCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                setPage(1)
              }}
              aria-label="Filter aksi"
            >
              <option value="">Semua aksi</option>
              {Object.entries(ACTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(1)
              }}
              className="w-auto"
              aria-label="Dari tanggal"
            />
            <span className="text-sm text-muted-foreground">s.d.</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(1)
              }}
              className="w-auto"
              aria-label="Sampai tanggal"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Aksi</TableHead>
                <TableHead>Menu</TableHead>
                <TableHead className="hidden lg:table-cell">Rincian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Belum ada aktivitas yang tercatat untuk filter ini.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((l) => {
                  const a = actionInfo(l.action)
                  return (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(l)}
                      title="Klik untuk melihat rincian"
                    >
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">
                        {formatTime(l.created_at)}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{l.user_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{l.user_email}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={TONES[a.tone]}>
                          {a.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {resourceLabel(l.resource)}
                        {l.resource_id > 0 && (
                          <span className="text-xs text-muted-foreground"> #{l.resource_id}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[320px] truncate text-xs text-muted-foreground lg:table-cell">
                        {l.detail || "—"}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          <div className="mt-4">
            <Pagination
              total={total}
              page={page}
              pageSize={pageSize}
              onChange={(p, ps) => {
                setPage(ps !== pageSize ? 1 : p)
                setPageSize(ps)
              }}
              itemLabel="aktivitas"
            />
          </div>
        </CardContent>
      </Card>

      <ModalShell
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Rincian Aktivitas"
        description={selected ? formatTime(selected.created_at) : undefined}
        size="md"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">User</dt>
              <dd>
                {selected.user_name || "—"}
                {selected.user_email && (
                  <span className="text-muted-foreground"> · {selected.user_email}</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Aksi</dt>
              <dd>{actionInfo(selected.action).label}</dd>
              <dt className="text-muted-foreground">Menu</dt>
              <dd>
                {resourceLabel(selected.resource)}
                {selected.resource_id > 0 && ` #${selected.resource_id}`}
              </dd>
              <dt className="text-muted-foreground">Alamat IP</dt>
              <dd className="tabular-nums">{selected.ip || "—"}</dd>
              <dt className="text-muted-foreground">Permintaan</dt>
              <dd className="break-all font-mono text-xs">
                {selected.method} {selected.path} → {selected.status}
              </dd>
            </dl>
            <div>
              <p className="mb-1.5 font-medium">Data yang dikirim</p>
              {entries === null ? (
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{selected.detail}</pre>
              ) : entries.length === 0 ? (
                <p className="text-muted-foreground">Tidak ada data yang dikirim.</p>
              ) : (
                <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/50 p-3 text-xs">
                  {entries.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="font-mono text-muted-foreground">{k}</dt>
                      <dd className="break-all">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Password dan token tidak pernah dicatat.
              </p>
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  )
}
