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
import { NumberInput } from "@/components/ui/number-input"
import {
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  Image as ImageIcon,
  MessageCircle,
  Pencil,
  Trash2,
  Search,
  Wallet,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import { KwitansiDialog } from "@/components/KwitansiDialog"
import { ApiError, booksApi, categoriesApi, masjidSettingsApi, transactionsApi } from "@/lib/api"
import type { Book, Category, MasjidSettings, Transaction } from "@/lib/types"
import { formatRupiah, todayISO } from "@/lib/types"
import { buildTransactionNota, shareWhatsApp } from "@/lib/nota"

function formatTxDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function TransactionsPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  // Filters
  const [bookFilter, setBookFilter] = useState<number | "all">("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "pemasukan" | "pengeluaran">("all")
  const [search, setSearch] = useState("")

  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<"pemasukan" | "pengeluaran">("pemasukan")
  const [editTarget, setEditTarget] = useState<Transaction | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null)
  // Profil masjid untuk kop & footer nota/kwitansi WhatsApp.
  const [settings, setSettings] = useState<MasjidSettings | null>(null)
  const [kwitansiTarget, setKwitansiTarget] = useState<Transaction | null>(null)

  useEffect(() => {
    masjidSettingsApi
      .get()
      .then(setSettings)
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [booksResp, catsResp, txsResp] = await Promise.all([
        booksApi.list(),
        categoriesApi.list(),
        transactionsApi.list(),
      ])
      setBooks(booksResp.books ?? [])
      setCategories(catsResp.categories ?? [])
      setTxs(txsResp.transactions ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat transaksi")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return txs.filter((t) => {
      if (bookFilter !== "all" && t.book_id !== bookFilter) return false
      if (typeFilter !== "all" && t.type !== typeFilter) return false
      if (q) {
        const hay = `${t.description} ${t.partner_name} ${t.ref_no} ${t.category?.name ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [txs, bookFilter, typeFilter, search])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    filtered.forEach((t) => {
      if (t.type === "pemasukan") income += t.amount
      else expense += t.amount
    })
    return { income, expense, net: income - expense }
  }, [filtered])

  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await transactionsApi.remove(pendingDelete.id)
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
          <h1 className="text-2xl font-bold tracking-tight">Transaksi Kas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Catat pemasukan dan pengeluaran masjid.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
            onClick={() => {
              setCreateType("pemasukan")
              setCreateOpen(true)
            }}
          >
            <ArrowDownCircle className="h-4 w-4" /> Pemasukan
          </Button>
          <Button
            variant="outline"
            className="border-rose-500/30 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            onClick={() => {
              setCreateType("pengeluaran")
              setCreateOpen(true)
            }}
          >
            <ArrowUpCircle className="h-4 w-4" /> Pengeluaran
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pemasukan</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatRupiah(totals.income)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pengeluaran</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {formatRupiah(totals.expense)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Selisih</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums">{formatRupiah(totals.net)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Daftar Transaksi</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Cari keterangan / donatur / no. bukti..."
                className="pl-8"
              />
            </div>
            <select
              className="h-9 rounded-lg border bg-background px-3 text-sm"
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
            <select
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as typeof typeFilter)
                setPage(1)
              }}
            >
              <option value="all">Semua Tipe</option>
              <option value="pemasukan">Pemasukan</option>
              <option value="pengeluaran">Pengeluaran</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden sm:table-cell">Tanggal</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="hidden md:table-cell">Keterangan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Belum ada transaksi.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                      {formatTxDate(t.date)}
                    </TableCell>
                    <TableCell>
                      {/* On phones the date column is hidden, so show it here. */}
                      <p className="mb-1 text-xs tabular-nums text-muted-foreground sm:hidden">
                        {formatTxDate(t.date)}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={
                            t.type === "pemasukan"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                          }
                        >
                          {t.type === "pemasukan" ? "Masuk" : "Keluar"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {t.category?.name ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-[280px] md:table-cell">
                      <p className="truncate">{t.description || "—"}</p>
                      {(t.partner_name || t.ref_no) && (
                        <p className="truncate text-xs text-muted-foreground">
                          {t.partner_name}
                          {t.ref_no && ` · #${t.ref_no}`}
                        </p>
                      )}
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right font-semibold tabular-nums ${
                        t.type === "pemasukan"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {t.type === "pemasukan" ? "+" : "−"}
                      {formatRupiah(t.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        actions={[
                          {
                            label: "Kwitansi (Gambar)",
                            icon: <ImageIcon className="h-4 w-4" />,
                            onClick: () => setKwitansiTarget(t),
                          },
                          {
                            label: "Nota (Teks)",
                            icon: <MessageCircle className="h-4 w-4" />,
                            onClick: () =>
                              shareWhatsApp(
                                buildTransactionNota({
                                  masjid: settings,
                                  bookName: books.find((b) => b.id === t.book_id)?.name,
                                  tx: t,
                                }),
                              ),
                          },
                          {
                            label: "Edit",
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => setEditTarget(t),
                          },
                          {
                            label: "Hapus",
                            icon: <Trash2 className="h-4 w-4" />,
                            onClick: () => setPendingDelete(t),
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
              itemLabel="transaksi"
            />
          </div>
        </CardContent>
      </Card>

      <TransactionModal
        open={createOpen || !!editTarget}
        mode={editTarget ? "edit" : "create"}
        initialType={createType}
        initial={editTarget}
        books={books}
        categories={categories}
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

      <KwitansiDialog
        open={!!kwitansiTarget}
        tx={kwitansiTarget}
        masjid={settings}
        bookName={
          kwitansiTarget
            ? books.find((b) => b.id === kwitansiTarget.book_id)?.name
            : undefined
        }
        onClose={() => setKwitansiTarget(null)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus transaksi?"
        description={
          <>
            Transaksi <b>{pendingDelete?.description || pendingDelete?.category?.name}</b> sebesar{" "}
            <b>{pendingDelete ? formatRupiah(pendingDelete.amount) : ""}</b> akan dihapus.
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

function TransactionModal({
  open,
  mode,
  initialType,
  initial,
  books,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  initialType: "pemasukan" | "pengeluaran"
  initial: Transaction | null
  books: Book[]
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    book_id: "",
    category_id: "",
    date: todayISO(),
    type: initialType,
    amount: 0,
    description: "",
    partner_name: "",
    ref_no: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      book_id: initial
        ? String(initial.book_id)
        : books[0]
        ? String(books[0].id)
        : "",
      category_id: initial ? String(initial.category_id) : "",
      date: initial?.date ?? todayISO(),
      type: initial?.type ?? initialType,
      amount: initial?.amount ?? 0,
      description: initial?.description ?? "",
      partner_name: initial?.partner_name ?? "",
      ref_no: initial?.ref_no ?? "",
    })
    setError(null)
  }, [open, initial, initialType, books])

  const visibleCategories = useMemo(
    // Kategori hanya dari buku kas yang dipilih (backend juga memvalidasi),
    // lalu disaring per group: Category.group (pendapatan|pengeluaran) ↔
    // Transaction.type (pemasukan|pengeluaran).
    () =>
      categories.filter(
        (c) =>
          c.book_id === Number(form.book_id) &&
          c.group === (form.type === "pemasukan" ? "pendapatan" : "pengeluaran"),
      ),
    [categories, form.book_id, form.type],
  )

  const handleSave = async () => {
    setError(null)
    if (!form.book_id || !form.category_id) {
      setError("Buku kas dan kategori wajib dipilih")
      return
    }
    if (!form.amount || form.amount <= 0) {
      setError("Jumlah harus lebih besar dari 0")
      return
    }
    setSaving(true)
    try {
      if (mode === "create") {
        await transactionsApi.create({
          book_id: Number(form.book_id),
          category_id: Number(form.category_id),
          date: form.date,
          type: form.type,
          amount: form.amount,
          description: form.description,
          partner_name: form.partner_name,
          ref_no: form.ref_no,
        })
      } else if (initial) {
        await transactionsApi.update(initial.id, {
          category_id: Number(form.category_id),
          date: form.date,
          amount: form.amount,
          description: form.description,
          partner_name: form.partner_name,
          ref_no: form.ref_no,
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
      title={
        mode === "create"
          ? form.type === "pemasukan"
            ? "Catat Pemasukan"
            : "Catat Pengeluaran"
          : "Edit Transaksi"
      }
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
        {mode === "create" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="tx-book">Buku Kas *</Label>
              <select
                id="tx-book"
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                value={form.book_id}
                onChange={(e) => setForm((f) => ({ ...f, book_id: e.target.value, category_id: "" }))}
              >
                <option value="">— pilih buku —</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-type">Tipe *</Label>
              <select
                id="tx-type"
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as typeof f.type, category_id: "" }))
                }
              >
                <option value="pemasukan">Pemasukan</option>
                <option value="pengeluaran">Pengeluaran</option>
              </select>
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="tx-category">Kategori *</Label>
          <select
            id="tx-category"
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
            value={form.category_id}
            onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
          >
            <option value="">— pilih kategori —</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-date">Tanggal *</Label>
          <Input
            id="tx-date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tx-amount">Jumlah (Rp) *</Label>
          <NumberInput
            id="tx-amount"
            value={form.amount}
            onValueChange={(n) => setForm((f) => ({ ...f, amount: n }))}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tx-desc">Keterangan</Label>
          <Input
            id="tx-desc"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Donasi pembangunan masjid..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-partner">Nama Donatur / Vendor</Label>
          <Input
            id="tx-partner"
            value={form.partner_name}
            onChange={(e) => setForm((f) => ({ ...f, partner_name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-ref">No. Bukti / Kwitansi</Label>
          <Input
            id="tx-ref"
            value={form.ref_no}
            onChange={(e) => setForm((f) => ({ ...f, ref_no: e.target.value }))}
          />
        </div>
      </div>
    </ModalShell>
  )
}
