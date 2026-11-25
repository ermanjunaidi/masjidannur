// Pembagian ke Warga — daftar penerima (nama, RT, RW, uang, beras) untuk
// buku kas bulan Ramadhan. Tiap baris tersimpan sebagai pengeluaran di buku
// itu, jadi saldo kas dan sisa beras ikut berkurang.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
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
import { NumberInput } from "@/components/ui/number-input"
import { HandHeart, Loader2, Pencil, Printer, Search, Trash2, UserPlus, Users, Wallet, Wheat } from "lucide-react"
import { ApiError, distributionsApi, masjidSettingsApi, residentsApi } from "@/lib/api"
import type { Book, MasjidSettings, RamadhanSummary, Resident, Transaction } from "@/lib/types"
import { esc, printHtml } from "@/lib/print"
import { ResidentsPanel } from "@/components/ResidentsPanel"
import { DistributionRtModal } from "@/components/DistributionRtModal"
import { formatKg, formatRupiah, todayISO } from "@/lib/types"

const selectClass = "h-9 rounded-lg border bg-background px-3 text-sm"

export default function DistributionsPage() {
  const [tab, setTab] = useState<"pembagian" | "warga">("pembagian")
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pembagian Warga</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Daftar warga dan pembagian uang serta beras dari buku kas bulan Ramadhan.
        </p>
      </div>
      <div className="inline-flex rounded-lg border bg-muted/40 p-1" role="tablist">
        {(
          [
            ["pembagian", "Pembagian"],
            ["warga", "Daftar Warga"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "pembagian" ? <DistributionTab /> : <ResidentsPanel />}
    </div>
  )
}

function DistributionTab() {
  const [books, setBooks] = useState<Book[]>([])
  const [bookId, setBookId] = useState<number | null>(null)
  const [rows, setRows] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<RamadhanSummary | null>(null)
  const [settings, setSettings] = useState<MasjidSettings | null>(null)
  // Daftar warga untuk pilihan nama di form.
  const [residents, setResidents] = useState<Resident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [rwFilter, setRwFilter] = useState("all")
  const [rtFilter, setRtFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [createOpen, setCreateOpen] = useState(false)
  const [rtOpen, setRtOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Transaction | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null)

  // Buku kas Ramadhan + profil masjid (kop cetak).
  useEffect(() => {
    let cancelled = false
    masjidSettingsApi
      .get()
      .then((s) => {
        if (!cancelled) setSettings(s)
      })
      .catch(() => {})
    residentsApi
      .list()
      .then((r) => {
        if (!cancelled) setResidents(r.residents ?? [])
      })
      .catch(() => {})
    distributionsApi
      .books()
      .then((r) => {
        if (cancelled) return
        const ramadhan = r.books ?? []
        setBooks(ramadhan)
        const first = ramadhan.find((b) => b.is_active) ?? ramadhan[0]
        if (first) setBookId(first.id)
        else setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof ApiError ? e.message : "Gagal memuat buku kas")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    if (!bookId) return
    setLoading(true)
    setError(null)
    try {
      const r = await distributionsApi.list(bookId)
      setRows(r.distributions ?? [])
      setSummary(r.summary)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat daftar pembagian")
    } finally {
      setLoading(false)
    }
  }, [bookId])

  useEffect(() => {
    void load()
  }, [load])

  const book = books.find((b) => b.id === bookId) ?? null
  const rwOptions = useMemo(() => distinct(rows.map((r) => r.rw ?? "")), [rows])
  const rtOptions = useMemo(
    () => distinct(rows.filter((r) => rwFilter === "all" || (r.rw ?? "") === rwFilter).map((r) => r.rt ?? "")),
    [rows, rwFilter],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (rwFilter !== "all" && (r.rw ?? "") !== rwFilter) return false
      if (rtFilter !== "all" && (r.rt ?? "") !== rtFilter) return false
      if (q && !`${r.partner_name} ${r.description}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, rwFilter, rtFilter])

  const filteredTotals = useMemo(
    () => ({
      amount: filtered.reduce((n, r) => n + r.amount, 0),
      rice: filtered.reduce((n, r) => n + (r.rice_kg ?? 0), 0),
    }),
    [filtered],
  )
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)
  // Rekap per RT dari seluruh pembagian buku ini (tidak ikut filter).
  const recap = useMemo(() => recapByRt(rows), [rows])

  const handleDelete = async (target: Transaction) => {
    try {
      await distributionsApi.remove(target.id)
      void load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus")
    }
  }

  const handlePrint = () => {
    if (!book) return
    const scope = [
      rwFilter !== "all" ? `RW ${rwFilter || "(kosong)"}` : "",
      rtFilter !== "all" ? `RT ${rtFilter || "(kosong)"}` : "",
      search.trim() ? `Pencarian "${search.trim()}"` : "",
    ].filter(Boolean)
    printDistributions({ rows: filtered, book, masjid: settings, scope: scope.join(" · ") })
  }

  if (!loading && books.length === 0) {
    return (
      <div className="space-y-6">
        {error && <ErrorBox message={error} />}
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <HandHeart className="mx-auto mb-3 h-7 w-7" />
            <p className="font-medium text-foreground">Belum ada buku kas bulan Ramadhan.</p>
            <p className="mt-1">
              Buat buku kas dan centang <b>Buku kas bulan Ramadhan</b>, lalu daftar pembagian ke
              warga bisa diisi di sini.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/admin/books">Buka Buku Kas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            className={selectClass}
            value={bookId ?? ""}
            onChange={(e) => {
              setBookId(Number(e.target.value))
              setRwFilter("all")
              setRtFilter("all")
              setSearch("")
              setPage(1)
            }}
            aria-label="Buku kas Ramadhan"
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={handlePrint} disabled={loading || filtered.length === 0}>
            <Printer className="h-4 w-4" /> Cetak
          </Button>
          <Button variant="outline" onClick={() => setRtOpen(true)} disabled={!book}>
            <Users className="h-4 w-4" /> Bagikan per RT
          </Button>
          <Button onClick={() => setCreateOpen(true)} disabled={!book}>
            <UserPlus className="h-4 w-4" /> Tambah Warga
          </Button>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title="Terkumpul"
          icon={<Wallet className="h-4 w-4 text-emerald-500" />}
          money={summary?.income ?? 0}
          rice={summary?.rice_in ?? 0}
        />
        <SummaryCard
          title={`Dibagikan · ${summary?.recipients ?? 0} warga`}
          icon={<HandHeart className="h-4 w-4 text-rose-500" />}
          money={summary?.distributed_amount ?? 0}
          rice={summary?.distributed_rice ?? 0}
        />
        <SummaryCard
          title="Sisa"
          icon={<Wheat className="h-4 w-4 text-primary" />}
          money={summary?.balance ?? 0}
          rice={summary?.rice_balance ?? 0}
          note={
            summary && summary.expense > summary.distributed_amount
              ? `Termasuk pengeluaran lain ${formatRupiah(summary.expense - summary.distributed_amount)}`
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Daftar Penerima</CardTitle>
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
                <TableHead className="text-right">Uang</TableHead>
                <TableHead className="text-right">Beras</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {rows.length === 0
                      ? "Belum ada warga penerima. Klik Tambah Warga."
                      : "Tidak ada warga yang cocok dengan filter."}
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {(page - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{r.partner_name}</p>
                      {r.description && (
                        <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                          {r.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.rt || "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.rw || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {r.amount > 0 ? formatRupiah(r.amount) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {r.rice_kg ? formatKg(r.rice_kg) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        modal={{
                          title: r.partner_name,
                          description: `RT ${r.rt || "—"} / RW ${r.rw || "—"}`,
                        }}
                        actions={[
                          {
                            label: "Edit nama / data warga",
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
              {!loading && filtered.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={4}>Total {filtered.length} warga</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatRupiah(filteredTotals.amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatKg(filteredTotals.rice)}
                  </TableCell>
                  <TableCell />
                </TableRow>
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

      {recap.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rekap Pembagian per RT</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RW</TableHead>
                  <TableHead>RT</TableHead>
                  <TableHead className="text-right">Penerima</TableHead>
                  <TableHead className="text-right">Beras</TableHead>
                  <TableHead className="text-right">Uang</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recap.map((g) => (
                  <TableRow
                    key={`${g.rw}|${g.rt}`}
                    className="cursor-pointer"
                    title="Klik untuk menampilkan RT ini di daftar"
                    onClick={() => {
                      setRwFilter(g.rw)
                      setRtFilter(g.rt)
                      setPage(1)
                    }}
                  >
                    <TableCell className="tabular-nums">{g.rw || "—"}</TableCell>
                    <TableCell className="tabular-nums">{g.rt || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatKg(g.rice)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatRupiah(g.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={2}>Total {recap.length} RT</TableCell>
                  <TableCell className="text-right tabular-nums">{rows.length}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatKg(recap.reduce((n, g) => n + g.rice, 0))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatRupiah(recap.reduce((n, g) => n + g.amount, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {book && (
        <DistributionRtModal
          open={rtOpen}
          book={book}
          residents={residents}
          given={rows}
          onClose={() => setRtOpen(false)}
          onDone={() => void load()}
        />
      )}

      {book && (
        <RecipientModal
          open={createOpen || !!editTarget}
          book={book}
          residents={residents}
          given={rows}
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
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus penerima?"
        description={
          <>
            <b>{pendingDelete?.partner_name}</b> akan dihapus dari daftar pembagian. Uang dan beras
            yang tercatat untuknya kembali ke sisa.
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

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</div>
  )
}

function SummaryCard({
  title,
  icon,
  money,
  rice,
  note,
}: {
  title: string
  icon: React.ReactNode
  money: number
  rice: number
  note?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold tabular-nums">{formatRupiah(money)}</div>
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">Beras {formatKg(rice)}</p>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

/** Jumlah penerima, beras, dan uang per RW/RT, urut RW lalu RT. */
function recapByRt(rows: Transaction[]) {
  const map = new Map<string, { rw: string; rt: string; count: number; rice: number; amount: number }>()
  rows.forEach((r) => {
    const rw = r.rw ?? ""
    const rt = r.rt ?? ""
    const g = map.get(`${rw}|${rt}`) ?? { rw, rt, count: 0, rice: 0, amount: 0 }
    g.count++
    g.rice += r.rice_kg ?? 0
    g.amount += r.amount
    map.set(`${rw}|${rt}`, g)
  })
  return [...map.values()].sort(
    (a, b) =>
      a.rw.localeCompare(b.rw, "id", { numeric: true }) ||
      a.rt.localeCompare(b.rt, "id", { numeric: true }),
  )
}

/** Kunci pembanding satu orang: nama (tanpa beda huruf besar) + RT + RW. */
function personKey(name: string, rt?: string, rw?: string): string {
  return `${name.trim().toLowerCase()}|${rt ?? ""}|${rw ?? ""}`
}

/** Nilai unik, terurut seperti angka ("2" sebelum "10"). */
function distinct(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "id", { numeric: true }))
}

// ─── Form tambah / edit penerima ──────────────────────────────────────────────

function RecipientModal({
  open,
  book,
  residents,
  given,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  book: Book
  /** Daftar warga untuk pilihan nama. */
  residents: Resident[]
  /** Pembagian yang sudah tercatat di buku ini (penanda "sudah menerima"). */
  given: Transaction[]
  initial: Transaction | null
  onClose: () => void
  /** keepOpen = "Simpan & tambah lagi". */
  onSaved: (keepOpen: boolean) => void
}) {
  const empty = {
    name: "",
    rt: "",
    rw: "",
    amount: 0,
    rice_kg: 0,
    date: todayISO(),
    description: "",
  }
  const [form, setForm] = useState(empty)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      name: initial?.partner_name ?? "",
      rt: initial?.rt ?? "",
      rw: initial?.rw ?? "",
      amount: initial?.amount ?? 0,
      rice_kg: initial?.rice_kg ?? 0,
      date: initial?.date ?? todayISO(),
      description: initial?.description ?? "",
    })
    setError(null)
    setNotice(null)
  }, [open, initial])

  // Pilihan nama dari daftar warga: muncul saat mengetik, memilih satu
  // mengisi nama + RT + RW sekaligus.
  const [pickerOpen, setPickerOpen] = useState(false)
  const givenKeys = useMemo(
    () => new Set(given.filter((g) => g.id !== initial?.id).map((g) => personKey(g.partner_name, g.rt, g.rw))),
    [given, initial],
  )
  const matches = useMemo(() => {
    const q = form.name.trim().toLowerCase()
    return residents
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [residents, form.name])

  const handleSave = async (keepOpen: boolean) => {
    setError(null)
    setNotice(null)
    const name = form.name.trim()
    if (!name) {
      setError("Nama warga wajib diisi")
      return
    }
    if (form.amount <= 0 && form.rice_kg <= 0) {
      setError("Isi uang (Rp) atau beras (kg) yang dibagikan")
      return
    }
    setSaving(true)
    try {
      if (initial) {
        await distributionsApi.update(initial.id, {
          partner_name: name,
          rt: form.rt.trim(),
          rw: form.rw.trim(),
          amount: form.amount,
          rice_kg: form.rice_kg,
          date: form.date,
          description: form.description,
        })
      } else {
        await distributionsApi.create(book.id, {
          partner_name: name,
          rt: form.rt.trim(),
          rw: form.rw.trim(),
          amount: form.amount,
          rice_kg: form.rice_kg,
          date: form.date,
          description: form.description,
        })
      }
      if (keepOpen) {
        // RT/RW, jumlah, dan tanggal dipertahankan: warga satu RT biasanya
        // menerima jumlah yang sama, tinggal ketik nama berikutnya.
        setForm((f) => ({ ...f, name: "", description: "" }))
        setNotice(`${name} tersimpan.`)
        document.getElementById("recipient-name")?.focus()
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
      title={initial ? "Edit Penerima" : "Tambah Warga Penerima"}
      description={`Buku kas: ${book.name}`}
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
      {error && <ErrorBox message={error} />}
      {notice && (
        <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{notice}</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="recipient-name">Nama Warga *</Label>
          <div className="relative">
            <Input
              id="recipient-name"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }))
                setPickerOpen(true)
              }}
              onFocus={() => setPickerOpen(true)}
              // Tunda supaya klik pada pilihan sempat terbaca.
              onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
              placeholder={residents.length > 0 ? "Ketik untuk memilih dari daftar warga" : "Nama penerima"}
              autoComplete="off"
              autoFocus
            />
            {pickerOpen && matches.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-background shadow-lg">
                {matches.map((r) => {
                  const done = givenKeys.has(personKey(r.name, r.rt, r.rw))
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setForm((f) => ({ ...f, name: r.name, rt: r.rt, rw: r.rw }))
                        setPickerOpen(false)
                      }}
                    >
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        RT {r.rt || "—"} / RW {r.rw || "—"}
                        {done && " · sudah menerima"}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {residents.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Daftar warga masih kosong. Isi di tab Daftar Warga (bisa import Excel) supaya nama
              tinggal dipilih.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipient-rt">RT</Label>
          <Input
            id="recipient-rt"
            value={form.rt}
            onChange={(e) => setForm((f) => ({ ...f, rt: e.target.value }))}
            placeholder="01"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipient-rw">RW</Label>
          <Input
            id="recipient-rw"
            value={form.rw}
            onChange={(e) => setForm((f) => ({ ...f, rw: e.target.value }))}
            placeholder="05"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipient-amount">Uang (Rp)</Label>
          <NumberInput
            id="recipient-amount"
            value={form.amount}
            onValueChange={(n) => setForm((f) => ({ ...f, amount: n }))}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipient-rice">Beras (kg)</Label>
          <NumberInput
            id="recipient-rice"
            value={form.rice_kg}
            onValueChange={(n) => setForm((f) => ({ ...f, rice_kg: n }))}
            maxFraction={2}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipient-date">Tanggal</Label>
          <Input
            id="recipient-date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipient-desc">Keterangan</Label>
          <Input
            id="recipient-desc"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Mis. fakir, janda, yatim"
          />
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Cetak ────────────────────────────────────────────────────────────────────

/** Cetak daftar penerima (A4 tegak) lengkap dengan kolom tanda tangan. */
function printDistributions(opts: {
  rows: Transaction[]
  book: Book
  masjid: MasjidSettings | null
  scope: string
}) {
  const { rows, book, masjid, scope } = opts
  const totalAmount = rows.reduce((n, r) => n + r.amount, 0)
  const totalRice = rows.reduce((n, r) => n + (r.rice_kg ?? 0), 0)
  const today = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
  const body = rows
    .map(
      (r, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(r.partner_name)}${r.description ? `<div class="note">${esc(r.description)}</div>` : ""}</td>
        <td class="c">${esc(r.rt ?? "")}</td>
        <td class="c">${esc(r.rw ?? "")}</td>
        <td class="r">${r.amount > 0 ? esc(formatRupiah(r.amount)) : "-"}</td>
        <td class="r">${r.rice_kg ? esc(formatKg(r.rice_kg)) : "-"}</td>
        <td class="sign"><span>${i + 1}.</span></td>
      </tr>`,
    )
    .join("")
  const recapRows = recapByRt(rows)
  const recapHtml =
    recapRows.length > 1
      ? `<h3>Rekap per RT</h3>
  <table class="recap">
    <thead><tr><th>RW</th><th>RT</th><th>Penerima</th><th>Beras</th><th>Uang</th></tr></thead>
    <tbody>${recapRows
      .map(
        (g) => `<tr><td class="c">${esc(g.rw || "-")}</td><td class="c">${esc(g.rt || "-")}</td>
        <td class="r">${g.count}</td><td class="r">${esc(formatKg(g.rice))}</td>
        <td class="r">${esc(formatRupiah(g.amount))}</td></tr>`,
      )
      .join("")}</tbody>
    <tfoot><tr><td colspan="2">Total</td><td class="r">${rows.length}</td>
      <td class="r">${esc(formatKg(totalRice))}</td><td class="r">${esc(formatRupiah(totalAmount))}</td></tr></tfoot>
  </table>`
      : ""
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Pembagian Warga - ${esc(book.name)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; margin: 0; }
  .kop { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
  .kop h1 { font-size: 15pt; margin: 0; }
  .kop p { margin: 2px 0 0; font-size: 9pt; }
  h2 { font-size: 12pt; text-align: center; margin: 0 0 2px; text-transform: uppercase; }
  .sub { text-align: center; font-size: 10pt; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #000; padding: 5px 6px; vertical-align: middle; }
  th { background: #e5e7eb; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  .note { font-size: 8.5pt; color: #444; }
  .sign { width: 26%; height: 26px; font-size: 8.5pt; color: #555; }
  tr:nth-child(even) .sign span { display: block; padding-left: 50%; }
  tfoot td { font-weight: bold; background: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h3 { font-size: 11pt; margin: 18px 0 6px; page-break-after: avoid; }
  table.recap { width: 70%; }
  .ttd { margin-top: 28px; display: flex; justify-content: flex-end; }
  .ttd div { text-align: center; width: 220px; font-size: 10.5pt; }
  .ttd .space { height: 64px; }
  .foot { margin-top: 14px; font-size: 8.5pt; color: #444; }
</style></head><body>
  <div class="kop">
    <h1>${esc(masjid?.name || "Masjid")}</h1>
    ${masjid?.address ? `<p>${esc(masjid.address)}</p>` : ""}
  </div>
  <h2>Daftar Pembagian kepada Warga</h2>
  <p class="sub">${esc(book.name)}${scope ? ` — ${esc(scope)}` : ""}</p>
  <table>
    <thead><tr>
      <th style="width:6%">No</th><th>Nama Warga</th><th style="width:7%">RT</th><th style="width:7%">RW</th>
      <th style="width:16%">Uang</th><th style="width:11%">Beras</th><th>Tanda Tangan</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr>
      <td colspan="4">Total ${rows.length} warga</td>
      <td class="r">${esc(formatRupiah(totalAmount))}</td>
      <td class="r">${esc(formatKg(totalRice))}</td>
      <td></td>
    </tr></tfoot>
  </table>
  ${recapHtml}
  <div class="ttd"><div>
    ${esc(masjid?.city_name ? `${masjid.city_name}, ` : "")}${esc(today)}<br>Panitia / Takmir
    <div class="space"></div>( ............................................ )
  </div></div>
  ${masjid?.report_footer ? `<p class="foot">${esc(masjid.report_footer)}</p>` : ""}
</body></html>`

  printHtml(html)
}
