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
import {
  Loader2,
  Plus,
  Tags,
  Pencil,
  Trash2,
  ArrowDownCircle,
  ArrowUpCircle,
  TriangleAlert,
} from "lucide-react"
import { ApiError, booksApi, categoriesApi } from "@/lib/api"
import type { Book, Category } from "@/lib/types"

export default function CategoriesPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [bookFilter, setBookFilter] = useState<number | "all">("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [booksResp, catsResp] = await Promise.all([
        booksApi.list(),
        categoriesApi.list(),
      ])
      setBooks(booksResp.books ?? [])
      setCategories(catsResp.categories ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat kategori")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const bookName = useMemo(() => {
    const m = new Map<number, string>()
    books.forEach((b) => m.set(b.id, b.name))
    return m
  }, [books])

  const filtered = useMemo(
    () =>
      bookFilter === "all"
        ? categories
        : categories.filter((c) => c.book_id === bookFilter),
    [categories, bookFilter],
  )

  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await categoriesApi.remove(pendingDelete.id)
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
          <h1 className="text-2xl font-bold tracking-tight">Kategori</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Kelompokkan pemasukan & pengeluaran per buku kas.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Tambah Kategori
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Daftar Kategori</CardTitle>
          <div className="w-full max-w-xs">
            <select
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={String(bookFilter)}
              onChange={(e) => {
                setBookFilter(e.target.value === "all" ? "all" : Number(e.target.value))
                setPage(1)
              }}
            >
              <option value="all">Semua Buku</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead className="hidden md:table-cell">Buku Kas</TableHead>
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
                    <Tags className="mx-auto mb-2 h-6 w-6" />
                    Belum ada kategori.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          cat.group === "pendapatan"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                        }
                      >
                        {cat.group === "pendapatan" ? (
                          <ArrowDownCircle className="mr-1 h-3 w-3" />
                        ) : (
                          <ArrowUpCircle className="mr-1 h-3 w-3" />
                        )}
                        {cat.group === "pendapatan" ? "Pendapatan" : "Pengeluaran"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {bookName.get(cat.book_id) ?? `Buku #${cat.book_id}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        actions={[
                          {
                            label: "Edit",
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => setEditTarget(cat),
                          },
                          {
                            label: "Hapus",
                            icon: <Trash2 className="h-4 w-4" />,
                            onClick: () => setPendingDelete(cat),
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
              itemLabel="kategori"
            />
          </div>
        </CardContent>
      </Card>

      <CategoryModal
        open={createOpen || !!editTarget}
        mode={editTarget ? "edit" : "create"}
        initial={editTarget}
        books={books}
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
        title="Hapus kategori?"
        description={
          <>
            Kategori <b>{pendingDelete?.name}</b> akan dihapus.
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

function CategoryModal({
  open,
  mode,
  initial,
  books,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  initial: Category | null
  books: Book[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    book_id: "",
    name: "",
    group: "pendapatan",
    description: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Guard "kategori biaya tapi kelompok pendapatan" (kasus: Listrik
  // tersimpan sebagai pendapatan). Dialog konfirmasi muncul sebelum
  // benar-benar menyimpan; data form tetap utuh di belakangnya.
  const [confirmExpenseGroup, setConfirmExpenseGroup] = useState(false)

  // Nama-nama yang nyaris selalu berarti biaya rutin masjid. Pencocokan
  // longgar (contains, case-insensitive) supaya varian seperti "Bayar
  // Listrik" atau "Tagihan Air" tetap tertangkap.
  const EXPENSE_HINTS = [
    "listrik",
    "air",
    "gaji",
    "honor",
    "kebersihan",
    "konsumsi",
    "atk",
    "bahan",
    "perbaikan",
    "pembangunan",
    "internet",
    "bbm",
  ]

  const looksLikeExpense = (name: string) => {
    const n = name.toLowerCase()
    return EXPENSE_HINTS.some((hint) => n.includes(hint))
  }

  useEffect(() => {
    if (!open) return
    setForm({
      book_id: initial ? String(initial.book_id) : books[0] ? String(books[0].id) : "",
      name: initial?.name ?? "",
      group: initial?.group ?? "pendapatan",
      description: initial?.description ?? "",
    })
    setError(null)
    setConfirmExpenseGroup(false)
  }, [open, initial, books])

  const handleSave = async () => {
    setError(null)
    if (!form.name.trim() || !form.book_id) {
      setError("Nama kategori dan buku kas wajib diisi")
      return
    }
    // Peringatan hanya di mode create: saat edit user sengaja mengubah
    // satu field, jangan ganggu dengan dialog kedua.
    if (mode === "create" && looksLikeExpense(form.name) && form.group === "pendapatan") {
      setConfirmExpenseGroup(true)
      return
    }
    await doSave()
  }

  const doSave = async () => {
    setConfirmExpenseGroup(false)
    setSaving(true)
    try {
      if (mode === "create") {
        await categoriesApi.create({
          book_id: Number(form.book_id),
          name: form.name.trim(),
          group: form.group as "pendapatan" | "pengeluaran",
          description: form.description,
        })
      } else if (initial) {
        await categoriesApi.update(initial.id, {
          name: form.name.trim(),
          group: form.group as "pendapatan" | "pengeluaran",
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
      title={mode === "create" ? "Tambah Kategori" : "Edit Kategori"}
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
        {mode === "create" && (
          <div className="space-y-1.5">
            <Label htmlFor="cat-book">Buku Kas *</Label>
            <select
              id="cat-book"
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={form.book_id}
              onChange={(e) => setForm((f) => ({ ...f, book_id: e.target.value }))}
            >
              <option value="">— pilih buku —</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cat-name">Nama Kategori *</Label>
          <Input
            id="cat-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Donasi / Kotak Amal / Listrik / Pembangunan"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-group">Kelompok *</Label>
          <select
            id="cat-group"
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
            value={form.group}
            onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
          >
            <option value="pendapatan">Pendapatan</option>
            <option value="pengeluaran">Pengeluaran</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-desc">Deskripsi</Label>
          <Input
            id="cat-desc"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmExpenseGroup}
        title="Kategori ini kelihatannya biaya?"
        description={
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Kategori bernama <b>{form.name.trim()}</b> biasanya termasuk <b>Pengeluaran</b>,
                tapi kelompok yang dipilih <b>Pendapatan</b>. Kelompok menentukan laporan kas —
                kelompok yang salah membuat total pemasukan/pengeluaran tidak akurat.
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Tetap simpan sebagai pendapatan, atau periksa ulang pilihan kelompoknya?
            </p>
          </div>
        }
        confirmLabel="Ya, Simpan Pendapatan"
        cancelLabel="Periksa Ulang"
        onClose={(ok) => {
          setConfirmExpenseGroup(false)
          if (ok) void doSave()
        }}
      />
    </ModalShell>
  )
}
