// Daftar Warga — data induk penerima pembagian (nama, RT, RW). Bisa diisi
// satu per satu atau lewat Excel: unduh template, isi, lalu import; daftar
// yang ada bisa di-export (dan di-import kembali setelah diedit).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ModalShell } from "@/components/UserModal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Pagination } from "@/components/ui/pagination"
import { RowActions } from "@/components/RowActions"
import { Download, FileSpreadsheet, Loader2, Pencil, Printer, Search, Trash2, Upload, UserPlus, Users } from "lucide-react"
import { ApiError, masjidSettingsApi, residentsApi } from "@/lib/api"
import type { MasjidSettings, Resident } from "@/lib/types"
import { esc, printHtml } from "@/lib/print"

const selectClass = "h-9 rounded-lg border bg-background px-3 text-sm"

function distinct(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "id", { numeric: true }))
}

export function ResidentsPanel() {
  const [rows, setRows] = useState<Resident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<"template" | "export" | "import" | null>(null)

  const [search, setSearch] = useState("")
  const [rwFilter, setRwFilter] = useState("all")
  const [rtFilter, setRtFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Resident | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Resident | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Profil masjid untuk kop cetak (opsional: tanpa izin Settings tetap bisa cetak).
  const [settings, setSettings] = useState<MasjidSettings | null>(null)
  useEffect(() => {
    masjidSettingsApi
      .get()
      .then(setSettings)
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await residentsApi.list()
      setRows(r.residents ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat daftar warga")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rwOptions = useMemo(() => distinct(rows.map((r) => r.rw)), [rows])
  const rtOptions = useMemo(
    () => distinct(rows.filter((r) => rwFilter === "all" || r.rw === rwFilter).map((r) => r.rt)),
    [rows, rwFilter],
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (rwFilter !== "all" && r.rw !== rwFilter) return false
      if (rtFilter !== "all" && r.rt !== rtFilter) return false
      if (q && !`${r.name} ${r.note}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, rwFilter, rtFilter])
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const download = async (kind: "template" | "export") => {
    setBusy(kind)
    setError(null)
    try {
      await (kind === "template" ? residentsApi.template() : residentsApi.exportExcel())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengunduh file")
    } finally {
      setBusy(null)
    }
  }

  const handleImport = async (file: File) => {
    setBusy("import")
    setError(null)
    setNotice(null)
    try {
      const res = await residentsApi.importExcel(file)
      const parts = [`${res.created} warga ditambahkan`]
      if (res.skipped > 0) parts.push(`${res.skipped} dilewati karena sudah ada`)
      setNotice(
        res.created === 0 && res.skipped === 0
          ? "Tidak ada warga di file itu. Isi kolom Nama mulai baris di bawah judul kolom."
          : `Import selesai: ${parts.join(", ")}.`,
      )
      void load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal meng-import file")
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const handleDelete = async (target: Resident) => {
    try {
      await residentsApi.remove(target.id)
      void load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => void download("template")} disabled={busy !== null}>
          {busy === "template" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Template
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Import
        </Button>
        <Button
          variant="outline"
          onClick={() => void download("export")}
          disabled={busy !== null || rows.length === 0}
        >
          {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export
        </Button>
        <Button
          variant="outline"
          onClick={() => printResidentsPerRt(filtered, settings)}
          disabled={loading || filtered.length === 0}
          title="Cetak daftar warga per RT (A4), mengikuti filter RW/RT dan pencarian"
        >
          <Printer className="h-4 w-4" /> Cetak per RT
        </Button>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4" /> Tambah Warga
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImport(file)
          }}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{notice}</div>
      )}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Daftar Warga ({rows.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Cari nama warga..."
                className="pl-8"
              />
            </div>
            <select
              className={selectClass}
              value={rwFilter}
              onChange={(e) => {
                setRwFilter(e.target.value)
                setRtFilter("all")
                setPage(1)
              }}
              aria-label="Filter RW"
            >
              <option value="all">Semua RW</option>
              {rwOptions.map((v) => (
                <option key={v} value={v}>
                  {v ? `RW ${v}` : "RW kosong"}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={rtFilter}
              onChange={(e) => {
                setRtFilter(e.target.value)
                setPage(1)
              }}
              aria-label="Filter RT"
            >
              <option value="all">Semua RT</option>
              {rtOptions.map((v) => (
                <option key={v} value={v}>
                  {v ? `RT ${v}` : "RT kosong"}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">No</TableHead>
                <TableHead>Nama Warga</TableHead>
                <TableHead>RT</TableHead>
                <TableHead>RW</TableHead>
                <TableHead className="hidden md:table-cell">Keterangan</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {rows.length === 0 ? (
                      <>
                        <Users className="mx-auto mb-2 h-6 w-6" />
                        Belum ada warga. Klik <b>Tambah Warga</b>, atau unduh <b>Template</b>, isi di
                        Excel, lalu <b>Import</b>.
                      </>
                    ) : (
                      "Tidak ada warga yang cocok dengan filter."
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {(page - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="tabular-nums">{r.rt || "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.rw || "—"}</TableCell>
                    <TableCell className="hidden max-w-[280px] truncate text-muted-foreground md:table-cell">
                      {r.note || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        modal={{ title: r.name, description: `RT ${r.rt || "—"} / RW ${r.rw || "—"}` }}
                        actions={[
                          {
                            label: "Edit",
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => setEditTarget(r),
                          },
                          {
                            label: "Hapus",
                            icon: <Trash2 className="h-4 w-4" />,
                            onClick: () => setPendingDelete(r),
                            destructive: true,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="mt-4">
            <Pagination
              total={filtered.length}
              page={page}
              pageSize={pageSize}
              onChange={(p, ps) => {
                setPage(p)
                setPageSize(ps)
              }}
              itemLabel="warga"
            />
          </div>
        </CardContent>
      </Card>

      <ResidentModal
        open={createOpen || !!editTarget}
        initial={editTarget}
        onClose={() => {
          setCreateOpen(false)
          setEditTarget(null)
        }}
        onSaved={(keepOpen) => {
          if (!keepOpen) {
            setCreateOpen(false)
            setEditTarget(null)
          }
          void load()
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus warga?"
        description={
          <>
            <b>{pendingDelete?.name}</b> akan dihapus dari daftar warga. Pembagian yang sudah
            tercatat untuknya tidak ikut terhapus.
          </>
        }
        confirmLabel="Hapus"
        destructive
        onClose={(ok) => {
          const target = pendingDelete
          setPendingDelete(null)
          if (ok && target) void handleDelete(target)
        }}
      />
    </div>
  )
}

/**
 * Cetak daftar warga per RT di kertas A4 tegak: tiap RT mulai di halaman
 * baru dengan kop, judul RT, dan tabel bernomor berikut kolom beras, uang,
 * dan tanda tangan untuk diisi tangan saat pembagian.
 */
function printResidentsPerRt(rows: Resident[], masjid: MasjidSettings | null) {
  const groups = new Map<string, { rt: string; rw: string; members: Resident[] }>()
  rows.forEach((r) => {
    const key = `${r.rw}|${r.rt}`
    const g = groups.get(key) ?? { rt: r.rt, rw: r.rw, members: [] }
    g.members.push(r)
    groups.set(key, g)
  })
  const sorted = [...groups.values()].sort(
    (a, b) =>
      a.rw.localeCompare(b.rw, "id", { numeric: true }) ||
      a.rt.localeCompare(b.rt, "id", { numeric: true }),
  )
  const today = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
  const kop = `<div class="kop">
      <h1>${esc(masjid?.name || "Masjid")}</h1>
      ${masjid?.address ? `<p>${esc(masjid.address)}</p>` : ""}
    </div>`
  const pages = sorted
    .map((g) => {
      const members = [...g.members].sort((a, b) => a.name.localeCompare(b.name, "id"))
      const body = members
        .map(
          (m, i) => `<tr>
          <td class="c">${i + 1}</td>
          <td>${esc(m.name)}${m.note ? `<div class="note">${esc(m.note)}</div>` : ""}</td>
          <td></td><td></td>
          <td class="sign"><span>${i + 1}.</span></td>
        </tr>`,
        )
        .join("")
      return `<section>
      ${kop}
      <h2>Daftar Warga</h2>
      <p class="sub">RT ${esc(g.rt || "-")} / RW ${esc(g.rw || "-")} — ${members.length} warga</p>
      <table>
        <thead><tr>
          <th style="width:6%">No</th><th>Nama Warga</th>
          <th style="width:13%">Beras (kg)</th><th style="width:17%">Uang (Rp)</th>
          <th style="width:27%">Tanda Tangan</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="ttd">
        <div>Mengetahui,<br>Ketua RT ${esc(g.rt || "")}<div class="space"></div>( ................................ )</div>
        <div>${esc(masjid?.city_name ? `${masjid.city_name}, ` : "")}${esc(today)}<br>Panitia / Takmir<div class="space"></div>( ................................ )</div>
      </div>
    </section>`
    })
    .join("")
  printHtml(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Daftar Warga per RT</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; margin: 0; }
  section { page-break-after: always; break-after: page; }
  section:last-child { page-break-after: auto; break-after: auto; }
  .kop { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
  .kop h1 { font-size: 15pt; margin: 0; }
  .kop p { margin: 2px 0 0; font-size: 9pt; }
  h2 { font-size: 12pt; text-align: center; margin: 0 0 2px; text-transform: uppercase; }
  .sub { text-align: center; font-size: 11pt; font-weight: bold; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #000; padding: 5px 6px; vertical-align: middle; }
  th { background: #e5e7eb; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td { height: 28px; }
  .c { text-align: center; }
  .note { font-size: 8.5pt; color: #444; }
  .sign { font-size: 8.5pt; color: #555; }
  tr:nth-child(even) .sign span { display: block; padding-left: 50%; }
  .ttd { margin-top: 24px; display: flex; justify-content: space-between; page-break-inside: avoid; break-inside: avoid; }
  .ttd div { text-align: center; width: 220px; font-size: 10.5pt; }
  .ttd .space { height: 60px; width: auto; }
</style></head><body>${pages}</body></html>`)
}

function ResidentModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  initial: Resident | null
  onClose: () => void
  /** keepOpen = "Simpan & tambah lagi". */
  onSaved: (keepOpen: boolean) => void
}) {
  const [form, setForm] = useState({ name: "", rt: "", rw: "", note: "" })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      name: initial?.name ?? "",
      rt: initial?.rt ?? "",
      rw: initial?.rw ?? "",
      note: initial?.note ?? "",
    })
    setError(null)
    setNotice(null)
  }, [open, initial])

  const handleSave = async (keepOpen: boolean) => {
    setError(null)
    setNotice(null)
    const name = form.name.trim()
    if (!name) {
      setError("Nama warga wajib diisi")
      return
    }
    setSaving(true)
    try {
      const payload = { name, rt: form.rt.trim(), rw: form.rw.trim(), note: form.note.trim() }
      if (initial) await residentsApi.update(initial.id, payload)
      else await residentsApi.create(payload)
      if (keepOpen) {
        // RT/RW dipertahankan: biasanya mengisi warga per RT.
        setForm((f) => ({ ...f, name: "", note: "" }))
        setNotice(`${name} tersimpan.`)
        document.getElementById("resident-name")?.focus()
      }
      onSaved(keepOpen)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={initial ? "Edit Warga" : "Tambah Warga"}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {notice ? "Selesai" : "Batal"}
          </Button>
          {!initial && (
            <Button variant="outline" onClick={() => void handleSave(true)} disabled={saving}>
              Simpan & tambah lagi
            </Button>
          )}
          <Button onClick={() => void handleSave(false)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{notice}</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="resident-name">Nama Warga *</Label>
          <Input
            id="resident-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nama lengkap"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resident-rt">RT</Label>
          <Input
            id="resident-rt"
            value={form.rt}
            onChange={(e) => setForm((f) => ({ ...f, rt: e.target.value }))}
            placeholder="01"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resident-rw">RW</Label>
          <Input
            id="resident-rw"
            value={form.rw}
            onChange={(e) => setForm((f) => ({ ...f, rw: e.target.value }))}
            placeholder="05"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="resident-note">Keterangan</Label>
          <Input
            id="resident-note"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Mis. fakir, janda, yatim"
          />
        </div>
      </div>
    </ModalShell>
  )
}
