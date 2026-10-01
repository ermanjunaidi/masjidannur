import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Wallet,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Receipt,
} from "lucide-react"
import { Link } from "react-router"
import { ApiError, booksApi, transactionsApi } from "@/lib/api"
import type { Book, Transaction } from "@/lib/types"
import { formatRupiah } from "@/lib/types"

export default function AdminDashboard() {
  const [books, setBooks] = useState<Book[]>([])
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [booksResp, txsResp] = await Promise.all([
        booksApi.list(),
        transactionsApi.list(),
      ])
      setBooks(booksResp.books ?? [])
      setTxs(txsResp.transactions ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat dashboard")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    txs.forEach((t) => {
      if (t.type === "pemasukan") income += t.amount
      else expense += t.amount
    })
    return { income, expense, balance: income - expense }
  }, [txs])

  const recent = useMemo(() => txs.slice(0, 8), [txs])

  const stats = [
    {
      title: "Total Pemasukan",
      value: formatRupiah(totals.income),
      icon: TrendingUp,
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Total Pengeluaran",
      value: formatRupiah(totals.expense),
      icon: TrendingDown,
      color: "text-rose-600 dark:text-rose-400",
    },
    {
      title: "Saldo Kas",
      value: formatRupiah(totals.balance),
      icon: Wallet,
      color: "",
    },
    {
      title: "Jumlah Buku Kas",
      value: String(books.length),
      icon: BookOpen,
      color: "",
    },
  ]

  if (loading && txs.length === 0 && books.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Kas Masjid</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ringkasan keuangan masjid.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Muat Ulang
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <stat.icon className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold tabular-nums ${stat.color}`}>
                {stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaksi Terakhir</CardTitle>
          <CardDescription>
            8 transaksi kas terbaru dari semua buku.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada transaksi. Mulai dengan mencatat pemasukan pertama.
            </p>
          ) : (
            <div className="space-y-2">
              {recent.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border p-2.5 text-sm"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      t.type === "pemasukan"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {t.type === "pemasukan" ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {t.description || t.category?.name || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.book?.name ?? "—"} ·{" "}
                      {new Date(t.date + "T00:00:00").toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 font-semibold tabular-nums ${
                      t.type === "pemasukan"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {t.type === "pemasukan" ? "+" : "−"}
                    {formatRupiah(t.amount)}
                  </p>
                </div>
              ))}
              <Button asChild variant="outline" className="w-full" size="sm">
                <Link to="/admin/transactions">
                  <Receipt className="mr-2 h-4 w-4" />
                  Lihat Semua Transaksi
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
