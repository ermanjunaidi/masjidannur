import { useCallback, useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Wallet,
  ClipboardList,
  Wrench,
  Clock,
  AlertTriangle,
  Users,
  Receipt,
} from "lucide-react"
import { ApiError, dashboardApi } from "@/lib/api"
import type { DashboardSummary } from "@/lib/types"
import { WO_STATUS_LABELS, formatRupiah, formatNumber } from "@/lib/types"
import { Link } from "react-router"

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await dashboardApi.summary())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat dashboard")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const stats = [
    {
      title: "Pendapatan Hari Ini",
      value: data ? formatRupiah(data.today_revenue) : "—",
      icon: Wallet,
    },
    {
      title: "WO Hari Ini",
      value: data ? formatNumber(data.today_work_orders) : "—",
      icon: ClipboardList,
    },
    {
      title: "WO Aktif",
      value: data ? formatNumber(data.active_work_orders) : "—",
      icon: Wrench,
    },
    {
      title: "Menunggu Antrean",
      value: data ? formatNumber(data.waiting_work_orders) : "—",
      icon: Clock,
    },
    {
      title: "Part Perlu Beli",
      value: data ? formatNumber(data.low_stock_count) : "—",
      icon: AlertTriangle,
    },
    {
      title: "Total Pelanggan",
      value: data ? formatNumber(data.total_customers) : "—",
      icon: Users,
    },
    {
      title: "Piutang Belum Lunas",
      value: data
        ? `${formatNumber(data.unpaid_invoice_count)} / ${formatRupiah(data.unpaid_invoice_total)}`
        : "—",
      icon: Receipt,
    },
  ]

  const statusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-border",
    menunggu: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    dikerjakan: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    menunggu_approval: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    selesai: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    diambil: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    batal: "bg-destructive/10 text-destructive border-destructive/20",
  }

  if (loading && !data) {
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
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Bengkel</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ringkasan operasional bengkel hari ini.
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
              <div className="text-xl font-bold tabular-nums">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Queue hari ini */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Antrean Hari Ini</CardTitle>
            <CardDescription>
              {data?.queue.length ?? 0} kendaraan terdaftar hari ini.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.queue.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada work order hari ini.</p>
            ) : (
              <div className="space-y-2">
                {data!.queue.slice(0, 8).map((q) => (
                  <Link
                    key={q.id}
                    to={`/admin/work-orders/${q.id}`}
                    className="flex items-center gap-3 rounded-lg border p-2.5 text-sm transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {q.customer || "—"}
                        {q.plate && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {q.plate}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {q.wo_number}
                        {q.mechanic && ` • ${q.mechanic}`}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <Badge
                        className={statusColor[q.status] ?? ""}
                        variant="outline"
                      >
                        {WO_STATUS_LABELS[q.status] ?? q.status}
                      </Badge>
                      <p className="mt-1 font-semibold tabular-nums">
                        {formatRupiah(q.total)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low stock */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Part Perlu Dibeli</CardTitle>
            <CardDescription>
              Sparepart yang stoknya di bawah ambang minimum.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.low_stock.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Semua sparepart dalam kondisi stok aman.
              </p>
            ) : (
              <div className="space-y-2">
                {data!.low_stock.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku} • {p.unit}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {formatNumber(p.stock_qty)} {p.unit} (min {formatNumber(p.reorder_point)})
                      </p>
                    </div>
                  </div>
                ))}
                <Button asChild variant="outline" className="w-full" size="sm">
                  <Link to="/admin/spareparts">Kelola Stok</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
