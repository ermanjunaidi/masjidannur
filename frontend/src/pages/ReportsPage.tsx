import { useCallback, useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Wallet } from "lucide-react"
import { ApiError, booksApi, reportsApi } from "@/lib/api"
import type { Book, MonthlyReport, CategoryReportResponse, WeeklyReport } from "@/lib/types"
import { formatRupiah, currentMonth } from "@/lib/types"

type Tab = "monthly" | "category" | "weekly"

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("monthly")
  const [books, setBooks] = useState<Book[]>([])
  const [bookFilter, setBookFilter] = useState<number | "all">("all")

  // Monthly state
  const [month, setMonth] = useState(currentMonth())
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null)

  // Category state
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(today())
  const [catReport, setCatReport] = useState<CategoryReportResponse | null>(null)

  // Weekly state
  const [weekFrom, setWeekFrom] = useState(firstDayOfMonth())
  const [weekTo, setWeekTo] = useState(today())
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    booksApi
      .list()
      .then((r) => setBooks(r.books ?? []))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const bookId = bookFilter === "all" ? undefined : bookFilter
      if (tab === "monthly") {
        setMonthly(await reportsApi.monthly(month, bookId))
      } else if (tab === "category") {
        setCatReport(await reportsApi.category(from, to, bookId))
      } else {
        setWeekly(await reportsApi.weekly(weekFrom, weekTo, bookId))
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan")
    } finally {
      setLoading(false)
    }
  }, [tab, month, from, to, weekFrom, weekTo, bookFilter])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laporan Kas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Transparansi laporan keuangan masjid.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-lg border bg-background px-3 text-sm"
            value={String(bookFilter)}
            onChange={(e) =>
              setBookFilter(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">Semua Buku</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Muat Ulang
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        {(
          [
            ["monthly", "Bulanan"],
            ["category", "Per Kategori"],
            ["weekly", "Mingguan"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ─── Monthly ─────────────────────────────────────────────────── */}
      {tab === "monthly" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Laporan Kas Bulanan</CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rep-month">Bulan</Label>
                <Input
                  id="rep-month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-44"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {monthly && <TotalsCards totals={monthly.totals} />}
            {monthly && monthly.rows.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="hidden md:table-cell">Kategori</TableHead>
                    <TableHead className="text-right">Masuk</TableHead>
                    <TableHead className="text-right">Keluar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthly.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{r.date}</TableCell>
                      <TableCell>
                        <p className="max-w-[240px] truncate">{r.description || "—"}</p>
                        {(r.partner_name || r.ref_no) && (
                          <p className="truncate text-xs text-muted-foreground">
                            {r.partner_name}
                            {r.ref_no && ` · #${r.ref_no}`}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {r.category}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {r.income ? formatRupiah(r.income) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {r.expense ? formatRupiah(r.expense) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Per Kategori ────────────────────────────────────────────── */}
      {tab === "category" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Laporan Kas per Kategori</CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rep-from">Dari</Label>
                <Input
                  id="rep-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rep-to">Sampai</Label>
                <Input
                  id="rep-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {catReport && <TotalsCards totals={catReport.totals} />}
            {catReport && catReport.rows.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Kelompok</TableHead>
                    <TableHead className="text-right">Transaksi</TableHead>
                    <TableHead className="text-right">Masuk</TableHead>
                    <TableHead className="text-right">Keluar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catReport.rows.map((r, i) => (
                    <TableRow key={`${r.group}-${r.id}-${i}`}>
                      <TableCell className="font-medium">{r.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.group}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {r.income ? formatRupiah(r.income) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {r.expense ? formatRupiah(r.expense) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Mingguan ────────────────────────────────────────────────── */}
      {tab === "weekly" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Laporan Kas Mingguan</CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rep-wfrom">Dari</Label>
                <Input
                  id="rep-wfrom"
                  type="date"
                  value={weekFrom}
                  onChange={(e) => setWeekFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rep-wto">Sampai</Label>
                <Input
                  id="rep-wto"
                  type="date"
                  value={weekTo}
                  onChange={(e) => setWeekTo(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {weekly && <TotalsCards totals={weekly.totals} />}
            {weekly && weekly.weeks.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pekan</TableHead>
                    <TableHead className="text-right">Masuk</TableHead>
                    <TableHead className="text-right">Keluar</TableHead>
                    <TableHead className="text-right">Selisih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weekly.weeks.map((w, i) => (
                    <TableRow key={w.start}>
                      <TableCell>
                        <p className="font-medium">Pekan {i + 1}</p>
                        <p className="text-xs text-muted-foreground">
                          {w.start} s/d {w.end}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatRupiah(w.income)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {formatRupiah(w.expense)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold tabular-nums ${
                          w.net >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {formatRupiah(w.net)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TotalsCards({ totals }: { totals: MonthlyReport["totals"] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-lg border bg-emerald-500/5 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-emerald-500" /> Pemasukan
        </div>
        <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatRupiah(totals.income)}
        </p>
      </div>
      <div className="rounded-lg border bg-rose-500/5 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingDown className="h-4 w-4 text-rose-500" /> Pengeluaran
        </div>
        <p className="mt-1 text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
          {formatRupiah(totals.expense)}
        </p>
      </div>
      <div className="rounded-lg border p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4 text-primary" /> Saldo Akhir
        </div>
        <p className="mt-1 text-lg font-bold tabular-nums">
          {formatRupiah(totals.end_cash || totals.net)}
        </p>
        {(totals.start_cash !== 0 || totals.end_cash !== 0) && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Saldo awal: {formatRupiah(totals.start_cash)}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── date helpers ─────────────────────────────────────────────────────────────

function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function firstDayOfMonth(): string {
  return today().slice(0, 8) + "01"
}
