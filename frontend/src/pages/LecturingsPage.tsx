import { useCallback, useEffect, useMemo, useState } from "react"
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
import { Badge } from "@/components/ui/badge"
import { RowActions } from "@/components/RowActions"
import { Loader2, Plus, CalendarDays, Pencil, Trash2 } from "lucide-react"
import { ApiError, lecturingsApi } from "@/lib/api"
import type { Lecturing, LecturingAudience } from "@/lib/types"
import { AUDIENCE_LABELS } from "@/lib/types"

const AUDIENCES: LecturingAudience[] = ["friday", "public", "muslimah", "tarawih"]

// Warna badge per jenis jadwal.
const AUDIENCE_STYLES: Record<LecturingAudience, string> = {
  friday: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  public: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  muslimah: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
  tarawih: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
}

function timeLabel(l: Lecturing): string {
  if (l.time_text) return l.time_text
  if (l.start_time && l.end_time) return `${l.start_time} – ${l.end_time}`
  if (l.start_time) return `${l.start_time} – selesai`
  return "-"
}

export default function LecturingsPage() {
  const [items, setItems] = useState<Lecturing[]>([])
  const [audienceFilter, setAudienceFilter] = useState<LecturingAudience | "all">("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Lecturing | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Lecturing | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await lecturingsApi.list()
      setItems(resp.lecturings ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat jadwal")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () =>
      audienceFilter === "all"
        ? items
        : items.filter((l) => l.audience === audienceFilter),
    [items, audienceFilter],
  )

  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await lecturingsApi.remove(pendingDelete.id)
      setPendingDelete(null)
      void load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jadwal Pengajian</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Kelola jadwal khatib Jumat dan pengajian rutin masjid.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Tambah Jadwal
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Daftar Jadwal</CardTitle>
          <div className="w-full max-w-xs">
            <select
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={audienceFilter}
              onChange={(e) => {
                setAudienceFilter(e.target.value as LecturingAudience | "all")
                setPage(1)
              }}
            >
              <option value="all">Semua Jenis</option>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a]}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead className="hidden sm:table-cell">Jenis</TableHead>
                <TableHead>Pemateri / Khatib</TableHead>
                <TableHead className="hidden md:table-cell">Waktu</TableHead>
                <TableHead className="hidden lg:table-cell">Topik / Kitab</TableHead>
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
                    <CalendarDays className="mx-auto mb-2 h-6 w-6" />
                    Belum ada jadwal.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {l.date}
                      {/* On phones the Jenis column is hidden, so show it here. */}
                      <div className="mt-1 sm:hidden">
                        <Badge variant="outline" className={AUDIENCE_STYLES[l.audience]}>
                          {AUDIENCE_LABELS[l.audience]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className={AUDIENCE_STYLES[l.audience]}>
                        {AUDIENCE_LABELS[l.audience]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal">{l.lecturer_name}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {timeLabel(l)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {l.title || l.book_title || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        actions={[
                          {
                            label: "Edit",
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => setEditTarget(l),
                          },
                          {
                            label: "Hapus",
                            icon: <Trash2 className="h-4 w-4" />,
                            onClick: () => setPendingDelete(l),
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
              itemLabel="jadwal"
            />
          </div>
        </CardContent>
      </Card>

      <LecturingModal
        open={createOpen || !!editTarget}
        mode={editTarget ? "edit" : "create"}
        initial={editTarget}
        onClose={() => {
          setCreateOpen(false)
          setEditTarget(null)
        }}
        onSaved={() => {
          setCreateOpen(false)
          setEditTarget(null)
          void load()
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus jadwal?"
        description={
          <>
            Jadwal <b>{pendingDelete?.lecturer_name}</b> ({pendingDelete?.date}) akan dihapus.
          </>
        }
        confirmLabel="Hapus"
        destructive
        onClose={(ok) => {
          setPendingDelete(null)
          if (ok) void handleDelete()
        }}
      />
    </div>
  )
}

function LecturingModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  initial: Lecturing | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    audience: "friday" as LecturingAudience,
    date: "",
    start_time: "",
    end_time: "",
    time_text: "",
    lecturer_name: "",
    imam_name: "",
    muadzin_name: "",
    title: "",
    book_title: "",
    book_writer: "",
    description: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      audience: initial?.audience ?? "friday",
      date: initial?.date ?? todayISO(),
      start_time: initial?.start_time ?? "",
      end_time: initial?.end_time ?? "",
      time_text: initial?.time_text ?? "",
      lecturer_name: initial?.lecturer_name ?? "",
      imam_name: initial?.imam_name ?? "",
      muadzin_name: initial?.muadzin_name ?? "",
      title: initial?.title ?? "",
      book_title: initial?.book_title ?? "",
      book_writer: initial?.book_writer ?? "",
      description: initial?.description ?? "",
    })
    setError(null)
  }, [open, initial])

  const handleSave = async () => {
    setError(null)
    if (!form.lecturer_name.trim()) {
      setError("Nama khatib / pemateri wajib diisi")
      return
    }
    if (!form.date) {
      setError("Tanggal wajib diisi")
      return
    }
    setSaving(true)
    try {
      if (mode === "create") {
        await lecturingsApi.create({
          audience: form.audience,
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time,
          time_text: form.time_text,
          lecturer_name: form.lecturer_name.trim(),
          imam_name: form.imam_name,
          muadzin_name: form.muadzin_name,
          title: form.title,
          book_title: form.book_title,
          book_writer: form.book_writer,
          description: form.description,
        })
      } else if (initial) {
        await lecturingsApi.update(initial.id, {
          audience: form.audience,
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time,
          time_text: form.time_text,
          lecturer_name: form.lecturer_name.trim(),
          imam_name: form.imam_name,
          muadzin_name: form.muadzin_name,
          title: form.title,
          book_title: form.book_title,
          book_writer: form.book_writer,
          description: form.description,
        })
      }
      onSaved()
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
      title={mode === "create" ? "Tambah Jadwal" : "Edit Jadwal"}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lec-audience">Jenis Jadwal *</Label>
          <select
            id="lec-audience"
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
            value={form.audience}
            onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value as LecturingAudience }))}
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lec-date">Tanggal *</Label>
          <Input
            id="lec-date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lec-start">Jam Mulai</Label>
          <Input
            id="lec-start"
            type="time"
            value={form.start_time}
            onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lec-end">Jam Selesai</Label>
          <Input
            id="lec-end"
            type="time"
            value={form.end_time}
            onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="lec-timetext">Label Waktu (opsional)</Label>
          <Input
            id="lec-timetext"
            value={form.time_text}
            onChange={(e) => setForm((f) => ({ ...f, time_text: e.target.value }))}
            placeholder="Ba'da Maghrib / Ba'da Isya / 06:00 pagi"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lec-lecturer">Khatib / Pemateri *</Label>
          <Input
            id="lec-lecturer"
            value={form.lecturer_name}
            onChange={(e) => setForm((f) => ({ ...f, lecturer_name: e.target.value }))}
            placeholder="Ust. Abdul ..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lec-title">Topik</Label>
          <Input
            id="lec-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Menjaga Lisan"
          />
        </div>
        {form.audience === "friday" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="lec-imam">Imam</Label>
              <Input
                id="lec-imam"
                value={form.imam_name}
                onChange={(e) => setForm((f) => ({ ...f, imam_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lec-muadzin">Muadzin</Label>
              <Input
                id="lec-muadzin"
                value={form.muadzin_name}
                onChange={(e) => setForm((f) => ({ ...f, muadzin_name: e.target.value }))}
              />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="lec-booktitle">Kitab</Label>
          <Input
            id="lec-booktitle"
            value={form.book_title}
            onChange={(e) => setForm((f) => ({ ...f, book_title: e.target.value }))}
            placeholder="Riyadhus Shalihin"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lec-bookwriter">Penulis Kitab</Label>
          <Input
            id="lec-bookwriter"
            value={form.book_writer}
            onChange={(e) => setForm((f) => ({ ...f, book_writer: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="lec-desc">Catatan</Label>
          <Input
            id="lec-desc"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </div>
    </ModalShell>
  )
}

function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}
