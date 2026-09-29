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
import { NumberInput } from "@/components/ui/number-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ModalShell } from "@/components/UserModal"
import { Pagination } from "@/components/ui/pagination"
import { Badge } from "@/components/ui/badge"
import { Loader2, Printer, Search } from "lucide-react"
import { ApiError, invoicesApi } from "@/lib/api"
import type { Invoice } from "@/lib/types"
import { formatRupiah } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"
import { XlsxToolbar } from "@/components/XlsxToolbar"
import NotaModal from "@/components/NotaModal"
import {
  PAYMENT_COLUMNS,
  PAYMENT_SAMPLE_ROWS,
  parsePaymentRows,
  applyPaymentRow,
} from "@/lib/workshopExcel"

const STATUS_COLORS: Record<string, string> = {
  unpaid: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  partial: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
}

const STATUS_LABELS: Record<string, string> = {
  unpaid: "Belum Lunas",
  partial: "Sebagian",
  paid: "Lunas",
}

export default function InvoicesPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("invoices:write")

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [detailTarget, setDetailTarget] = useState<Invoice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await invoicesApi.list(q || undefined)
      setInvoices(resp.invoices ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat invoice")
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const pageItems = invoices.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoice</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Tagihan, pembayaran, dan piutang pelanggan.
          </p>
        </div>
        <XlsxToolbar
          columns={PAYMENT_COLUMNS}
          filename="pembayaran"
          sampleRows={PAYMENT_SAMPLE_ROWS}
          parseRows={parsePaymentRows}
          applyRow={applyPaymentRow}
          primaryKey={(r) => (r as { invoiceNo?: string }).invoiceNo ?? ""}
          title="Pembayaran"
          canWrite={canWrite}
          onImported={() => void load()}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="Cari no. invoice / pelanggan / WO..."
            className="h-8 w-64 rounded-lg border border-input bg-transparent pl-8 pr-2 text-sm focus-visible:outline-none"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. Invoice</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>WO</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dibayar</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Tidak ada invoice.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {inv.invoice_no}
                    </TableCell>
                    <TableCell className="font-medium">
                      {inv.work_order?.customer?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inv.work_order?.wo_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(inv.subtotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatRupiah(inv.total)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[inv.status] ?? ""}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("id-ID") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailTarget(inv)}
                      >
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="mt-4">
            <Pagination
              total={invoices.length}
              page={page}
              pageSize={pageSize}
              onChange={(p, ps) => {
                setPage(p)
                setPageSize(ps)
              }}
              itemLabel="invoice"
            />
          </div>
        </CardContent>
      </Card>

      <InvoiceDetailModal
        invoice={detailTarget}
        onClose={() => setDetailTarget(null)}
        onSaved={() => void load()}
      />
    </div>
  )
}

function InvoiceDetailModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: Invoice | null
  onClose: () => void
  onSaved: () => void
}) {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("invoices:write")

  const [payAmount, setPayAmount] = useState("")
  const [payReceived, setPayReceived] = useState("")
  const [payMethod, setPayMethod] = useState("tunai")
  const [payError, setPayError] = useState<string | null>(null)
  const [paySaving, setPaySaving] = useState(false)
  const [refreshed, setRefreshed] = useState<Invoice | null>(null)
  const [notaOpen, setNotaOpen] = useState(false)

  useEffect(() => {
    if (!invoice) return
    setPayAmount("")
    setPayReceived("")
    setPayError(null)
    setRefreshed(null)
  }, [invoice])

  // Refresh invoice data when modal opens
  useEffect(() => {
    if (!invoice) return
    void invoicesApi.get(invoice.id).then(setRefreshed).catch(() => setRefreshed(invoice))
  }, [invoice])

  const inv = refreshed ?? invoice
  if (!inv) return null

  const totalPaid = (inv.payments ?? []).reduce((s, p) => s + p.amount, 0)
  const remaining = inv.total - totalPaid
  const received = Number(payReceived) || 0
  // When cash received > amount owed, the extra is kembalian (change).
  const payAmountVal = Number(payAmount) || 0
  const change = received > 0 && received > payAmountVal ? received - payAmountVal : 0

  const handlePayment = async () => {
    setPayError(null)
    const amt = Number(payAmount)
    if (!amt || amt <= 0) {
      setPayError("Nominal harus lebih dari 0")
      return
    }
    setPaySaving(true)
    try {
      await invoicesApi.addPayment(inv.id, {
        amount: amt,
        method: payMethod,
        received: received,
        change: received > amt ? received - amt : 0,
      })
      // Refresh invoice
      const fresh = await invoicesApi.get(inv.id)
      setRefreshed(fresh)
      setPayAmount("")
      setPayReceived("")
      onSaved()
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : "Gagal mencatat pembayaran")
    } finally {
      setPaySaving(false)
    }
  }

  return (
    <ModalShell
      open={!!invoice}
      onClose={onClose}
      title={`Invoice ${inv.invoice_no}`}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground text-xs">Pelanggan</p>
          <p className="font-medium">{inv.work_order?.customer?.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{inv.work_order?.customer?.phone ?? ""}</p>
        </div>
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground text-xs">WO</p>
          <p className="font-mono text-sm">{inv.work_order?.wo_number ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{inv.work_order?.service_type ?? ""}</p>
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatRupiah(inv.subtotal)}</span>
        </div>
        {inv.discount > 0 && (
          <div className="flex justify-between text-amber-600 dark:text-amber-400">
            <span>Diskon</span>
            <span>-{formatRupiah(inv.discount)}</span>
          </div>
        )}
        {inv.tax > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pajak</span>
            <span>{formatRupiah(inv.tax)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-1.5 font-semibold">
          <span>Total</span>
          <span>{formatRupiah(inv.total)}</span>
        </div>
        <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
          <span>Sudah Dibayar</span>
          <span>{formatRupiah(totalPaid)}</span>
        </div>
        {inv.status !== "paid" && (
          <div className="flex justify-between text-amber-600 dark:text-amber-400">
            <span>Sisa</span>
            <span>{formatRupiah(remaining)}</span>
          </div>
        )}
        <Badge variant="outline" className={STATUS_COLORS[inv.status] ?? ""}>
          {STATUS_LABELS[inv.status] ?? inv.status}
        </Badge>
      </div>

      <Button variant="outline" className="w-full" onClick={() => setNotaOpen(true)}>
        <Printer className="h-4 w-4" /> Cetak / Bagikan Nota
      </Button>

      {/* Payments history */}
      <div>
        <p className="text-sm font-medium mb-2">Riwayat Pembayaran</p>
        {(inv.payments ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pembayaran.</p>
        ) : (
          <div className="space-y-1.5">
            {inv.payments!.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <div>
                  <span className="font-medium">{formatRupiah(p.amount)}</span>
                  <span className="ml-2 text-xs text-muted-foreground capitalize">{p.method}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(p.paid_at).toLocaleString("id-ID")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add payment */}
      {canWrite && inv.status !== "paid" && (
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">Catat Pembayaran</p>
          {payError && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{payError}</div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Jumlah Bayar (sisa {formatRupiah(remaining)})</Label>
              <NumberInput
                id="pay-amount"
                value={Number(payAmount) || 0}
                onValueChange={(n) => setPayAmount(String(n))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-received">Uang Diterima (tunai)</Label>
              <NumberInput
                id="pay-received"
                value={Number(payReceived) || 0}
                onValueChange={(n) => setPayReceived(String(n))}
                placeholder="0"
              />
            </div>
          </div>
          {change > 0 && (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Kembalian: {formatRupiah(change)}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 space-y-1.5 min-w-32">
              <Label htmlFor="pay-method">Metode</Label>
              <select
                id="pay-method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none"
              >
                <option value="tunai">Tunai</option>
                <option value="transfer">Transfer</option>
                <option value="qris">QRIS</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={handlePayment} disabled={paySaving} size="default">
                {paySaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Bayar
              </Button>
            </div>
          </div>
        </div>
      )}

      {notaOpen && <NotaModal invoice={inv} onClose={() => setNotaOpen(false)} />}
    </ModalShell>
  )
}