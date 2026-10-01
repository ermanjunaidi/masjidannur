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
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ModalShell } from "@/components/UserModal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Pagination } from "@/components/ui/pagination"
import { Badge } from "@/components/ui/badge"
import { RowActions } from "@/components/RowActions"
import { Loader2, BookPlus, BookOpen, Pencil, Trash2, Info } from "lucide-react"
import { ApiError, booksApi } from "@/lib/api"
import type { Book } from "@/lib/types"

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Book | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Book | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await booksApi.list()
      setBooks(resp.books ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat buku kas")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pageItems = books.slice((page - 1) * pageSize, page * pageSize)

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await booksApi.remove(pendingDelete.id)
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
          <h1 className="text-2xl font-bold tracking-tight">Buku Kas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Setiap kegiatan masjid punya buku catatan kas terpisah.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <BookPlus className="h-4 w-4" /> Tambah Buku
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Buku Kas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Buku</TableHead>
                <TableHead className="hidden md:table-cell">Deskripsi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    <BookOpen className="mx-auto mb-2 h-6 w-6" />
                    Belum ada buku kas.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="hidden max-w-[300px] truncate text-muted-foreground md:table-cell">
                      {b.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          b.is_active
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-muted text-muted-foreground border-border"
                        }
                      >
                        {b.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        actions={[
                          {
                            label: "Edit",
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => setEditTarget(b),
                          },
                          {
                            label: "Hapus",
                            icon: <Trash2 className="h-4 w-4" />,
                            onClick: () => setPendingDelete(b),
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
              total={books.length}
              page={page}
              pageSize={pageSize}
              onChange={(p, ps) => {
                setPage(p)
                setPageSize(ps)
              }}
              itemLabel="buku"
            />
          </div>
        </CardContent>
      </Card>

      <BookModal
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
        title="Hapus buku kas?"
        description={
          <>
            Buku <b>{pendingDelete?.name}</b> akan dihapus. Transaksi di dalamnya
            tidak ikut terhapus tetapi tidak bisa diakses lewat buku ini lagi.
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

function BookModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  initial: Book | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ name: "", description: "", is_active: true })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      is_active: initial?.is_active ?? true,
    })
    setError(null)
  }, [open, initial])

  const handleSave = async () => {
    setError(null)
    if (!form.name.trim()) {
      setError("Nama buku wajib diisi")
      return
    }
    setSaving(true)
    try {
      if (mode === "create") {
        await booksApi.create({
          name: form.name.trim(),
          description: form.description,
        })
      } else if (initial) {
        await booksApi.update(initial.id, {
          name: form.name.trim(),
          description: form.description,
          is_active: form.is_active,
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
      title={mode === "create" ? "Tambah Buku Kas" : "Edit Buku Kas"}
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
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="book-name">Nama Buku *</Label>
          <Input
            id="book-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Kas Pembangunan / Kas Operasional / Kas Ramadan"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="book-desc">Deskripsi</Label>
          <Input
            id="book-desc"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Keperluan buku ini..."
          />
        </div>
        {mode === "edit" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Buku aktif
          </label>
        )}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Contoh: buku terpisah untuk pembangunan, operasional harian, Ramadan,
            dan kajian rutin — agar laporan tiap kegiatan tidak tercampur.
          </span>
        </div>
      </div>
    </ModalShell>
  )
}
