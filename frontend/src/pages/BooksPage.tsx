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
import { NumberInput } from "@/components/ui/number-input"
import { RowActions } from "@/components/RowActions"
import { Loader2, BookPlus, BookOpen, Pencil, Trash2, Info, HandCoins } from "lucide-react"
import { ApiError, booksApi } from "@/lib/api"
import type { Book, SettlementInfo } from "@/lib/types"
import { formatRupiah, todayISO } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"

const selectClass = "h-9 w-full rounded-lg border bg-background px-3 text-sm"

export default function BooksPage() {
  const { user } = useAuth()
  const bookLocked = (user?.book_ids?.length ?? 0) > 0
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Book | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Book | null>(null)
  const [settleTarget, setSettleTarget] = useState<Book | null>(null)

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
        {/* User yang dikunci ke buku kas tertentu tidak bisa menambah buku. */}
        {!bookLocked && (
          <Button onClick={() => setCreateOpen(true)}>
            <BookPlus className="h-4 w-4" /> Tambah Buku
          </Button>
        )}
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
                    <TableCell className="font-medium">
                      {b.name}
                      {b.is_ramadhan && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
                        >
                          Ramadhan
                        </Badge>
                      )}
                      {b.is_phbi && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-sky-500/30 bg-sky-500/10 text-[10px] text-sky-700 dark:text-sky-400"
                        >
                          PHBI
                        </Badge>
                      )}
                    </TableCell>
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
                          ...(b.is_phbi
                            ? [
                                {
                                  label: "Serah Terima Sisa",
                                  icon: <HandCoins className="h-4 w-4" />,
                                  onClick: () => setSettleTarget(b),
                                },
                              ]
                            : []),
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

      <SettlementModal
        book={settleTarget}
        books={books}
        onClose={() => setSettleTarget(null)}
        onSaved={() => {
          setSettleTarget(null)
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
  const [form, setForm] = useState({
    name: "",
    description: "",
    is_active: true,
    is_ramadhan: false,
    is_phbi: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      is_active: initial?.is_active ?? true,
      is_ramadhan: initial?.is_ramadhan ?? false,
      is_phbi: initial?.is_phbi ?? false,
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
          is_ramadhan: form.is_ramadhan,
          is_phbi: form.is_phbi,
        })
      } else if (initial) {
        await booksApi.update(initial.id, {
          name: form.name.trim(),
          description: form.description,
          is_active: form.is_active,
          is_ramadhan: form.is_ramadhan,
          is_phbi: form.is_phbi,
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
        <div className="rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={form.is_ramadhan}
              onChange={(e) => setForm((f) => ({ ...f, is_ramadhan: e.target.checked }))}
            />
            Buku kas bulan Ramadhan
          </label>
          <p className="mt-1 pl-6 text-xs text-muted-foreground">
            Pemasukan bisa berupa uang dan beras (kg), dan tersedia daftar pembagian ke
            warga (nama, RT, RW) di menu Pembagian Warga.
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={form.is_phbi}
              onChange={(e) => setForm((f) => ({ ...f, is_phbi: e.target.checked }))}
            />
            Buku kas PHBI (peringatan hari besar)
          </label>
          <p className="mt-1 pl-6 text-xs text-muted-foreground">
            Satu buku untuk satu kegiatan PHBI agar datanya berdiri sendiri. Setelah acara
            selesai, sisa saldonya bisa diserahkan ke bendahara dengan catatan tersendiri.
          </p>
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
            PHBI (Maulid Nabi, Isra Mi'raj, dll.), dan kajian rutin — agar laporan
            tiap kegiatan tidak tercampur.
          </span>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Serah terima sisa saldo buku kas PHBI ────────────────────────────────────

function SettlementModal({
  book,
  books,
  onClose,
  onSaved,
}: {
  book: Book | null
  books: Book[]
  onClose: () => void
  onSaved: () => void
}) {
  const [info, setInfo] = useState<SettlementInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [form, setForm] = useState({
    amount: 0,
    date: todayISO(),
    destination_book_id: 0,
    handed_to: "Bendahara",
    note: "",
  })

  useEffect(() => {
    if (!book) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setInfo(null)
    booksApi
      .settlement(book.id)
      .then((r) => {
        if (cancelled) return
        setInfo(r)
        // Default: seluruh sisa saldo, disetor ke buku kas terdahulu yang
        // bukan PHBI (biasanya Kas Umum).
        const destination = books.find((b) => b.id !== book.id && !b.is_phbi)
        setForm({
          amount: r.balance,
          date: todayISO(),
          destination_book_id: destination?.id ?? 0,
          handed_to: "Bendahara",
          note: "",
        })
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Gagal memuat sisa saldo")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [book, books])

  const handleSave = async () => {
    if (!book || !info) return
    setError(null)
    if (form.amount <= 0 || form.amount > info.balance) {
      setError("Jumlah serah terima harus lebih dari 0 dan tidak melebihi sisa saldo.")
      return
    }
    setSaving(true)
    try {
      await booksApi.settle(book.id, {
        amount: form.amount,
        date: form.date,
        destination_book_id: form.destination_book_id,
        handed_to: form.handed_to,
        note: form.note,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan serah terima")
    } finally {
      setSaving(false)
    }
  }

  const handleCancelSettlement = async () => {
    if (!book) return
    setSaving(true)
    setError(null)
    try {
      await booksApi.cancelSettlement(book.id)
      setConfirmCancel(false)
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal membatalkan serah terima")
      setConfirmCancel(false)
    } finally {
      setSaving(false)
    }
  }

  const settlement = info?.settlement ?? null
  const destination = settlement?.destination_book_id
    ? books.find((b) => b.id === settlement.destination_book_id)
    : null
  const destinationOptions = books.filter((b) => b.id !== book?.id)

  return (
    <>
      <ModalShell
        open={!!book}
        onClose={onClose}
        title="Serah Terima Sisa Saldo"
        description={book ? `Buku kas PHBI: ${book.name}` : undefined}
        size="md"
        footer={
          settlement ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Tutup
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirmCancel(true)}
                disabled={saving}
              >
                Batalkan Serah Terima
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Batal
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || loading || !info || info.balance <= 0}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Serahkan Sisa
              </Button>
            </>
          )
        }
      >
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : settlement ? (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">Jumlah diserahkan</dt>
              <dd className="font-semibold tabular-nums">{formatRupiah(settlement.amount)}</dd>
              <dt className="text-muted-foreground">Tanggal</dt>
              <dd className="tabular-nums">{settlement.date}</dd>
              <dt className="text-muted-foreground">Diserahkan kepada</dt>
              <dd>{settlement.handed_to || "Bendahara"}</dd>
              <dt className="text-muted-foreground">Disetor ke buku</dt>
              <dd>
                {destination?.name ?? (settlement.destination_book?.name || "Tidak disetor ke buku lain")}
              </dd>
              <dt className="text-muted-foreground">Catatan</dt>
              <dd>{settlement.note || "—"}</dd>
            </dl>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Sisa saldo sudah dikeluarkan dari buku PHBI ini dan dicatat sebagai pemasukan
              di buku tujuan (bila dipilih). Batalkan serah terima untuk mengembalikan
              kedua transaksinya.
            </div>
          </div>
        ) : info ? (
          !info.is_phbi ? (
            <p className="text-sm text-muted-foreground">
              Buku ini bukan buku kas PHBI, jadi tidak punya serah terima sisa saldo.
            </p>
          ) : info.balance <= 0 ? (
            <p className="text-sm text-muted-foreground">
              Buku ini tidak punya sisa saldo untuk diserahkan.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Sisa saldo buku PHBI</p>
                <p className="text-xl font-bold tabular-nums">{formatRupiah(info.balance)}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settle-amount">Jumlah diserahkan</Label>
                <NumberInput
                  id="settle-amount"
                  value={form.amount}
                  onValueChange={(n) => setForm((f) => ({ ...f, amount: n }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settle-date">Tanggal</Label>
                <Input
                  id="settle-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settle-handed-to">Diserahkan kepada</Label>
                <Input
                  id="settle-handed-to"
                  value={form.handed_to}
                  onChange={(e) => setForm((f) => ({ ...f, handed_to: e.target.value }))}
                  placeholder="Nama bendahara"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settle-destination">Setor ke buku</Label>
                <select
                  id="settle-destination"
                  className={selectClass}
                  value={form.destination_book_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, destination_book_id: Number(e.target.value) }))
                  }
                >
                  <option value={0}>— Tidak disetor ke buku lain —</option>
                  {destinationOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.is_phbi ? " (PHBI)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settle-note">Catatan</Label>
                <Input
                  id="settle-note"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Mis. sisa panitia Maulid Nabi 1448 H"
                />
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Pengeluaran dicatat otomatis di buku PHBI ini. Bila buku tujuan dipilih,
                  pemasukan yang sama juga dicatat di sana — catatan serah terima tersimpan
                  tersendiri dan bisa dibatalkan.
                </span>
              </div>
            </div>
          )
        ) : null}
      </ModalShell>

      <ConfirmDialog
        open={confirmCancel}
        title="Batalkan serah terima?"
        description={
          <>
            Catatan serah terima <b>{book?.name}</b> beserta transaksi pengeluaran/pemasukan
            yang dibuatnya akan dihapus, dan sisa saldo kembali ke buku PHBI.
          </>
        }
        confirmLabel="Batalkan"
        destructive
        onClose={(ok) => {
          if (ok) void handleCancelSettlement()
          else setConfirmCancel(false)
        }}
      />
    </>
  )
}
