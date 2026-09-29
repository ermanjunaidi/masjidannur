import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Label } from "@/components/ui/label"
import { ModalShell } from "@/components/UserModal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Plus,
  Trash2,
  Check,
  X,
  FileText,
  ChevronLeft,
  Wrench,
  Package,
  User as UserIcon,
  Car,
} from "lucide-react"
import { ApiError, workOrdersApi, sparepartsApi, invoicesApi } from "@/lib/api"
import type { Sparepart, WorkOrder } from "@/lib/types"
import {
  WO_STATUS_LABELS,
  WO_PRIORITY_LABELS,
  formatRupiah,
  formatNumber,
} from "@/lib/types"
import { statusColor } from "./WorkOrdersPage"
import { useAuth } from "@/context/AuthContext"

const NEXT_ACTIONS: Record<string, { label: string; status: string; variant?: "default" | "destructive" }[]> = {
  draft: [
    { label: "Ke Antrean (Menunggu)", status: "menunggu" },
    { label: "Batalkan", status: "batal", variant: "destructive" },
  ],
  menunggu: [
    { label: "Mulai Dikerjakan", status: "dikerjakan" },
    { label: "Batalkan", status: "batal", variant: "destructive" },
  ],
  dikerjakan: [
    { label: "Selesai", status: "selesai" },
    { label: "Batalkan", status: "batal", variant: "destructive" },
  ],
  menunggu_approval: [],
  selesai: [{ label: "Tandai Diambil", status: "diambil" }],
  diambil: [],
  batal: [],
}

export default function WorkOrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("workorders:write")
  const canInvoice = hasPermission("invoices:write")

  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [itemModal, setItemModal] = useState(false)
  const [partModal, setPartModal] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      setWo(await workOrdersApi.get(Number(id)))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat WO")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Operasi gagal")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!wo) {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild size="sm">
          <Link to="/admin/work-orders"><ChevronLeft className="h-4 w-4" /> Kembali</Link>
        </Button>
        <p className="text-muted-foreground">{error ?? "WO tidak ditemukan"}</p>
      </div>
    )
  }

  const items = wo.items ?? []
  const parts = wo.parts ?? []
  const pendingCount = items.filter((i) => !i.is_approved).length + parts.filter((p) => !p.is_approved).length
  const actions = NEXT_ACTIONS[wo.status] ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" asChild size="sm">
          <Link to="/admin/work-orders"><ChevronLeft className="h-4 w-4" /> Kembali</Link>
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{wo.wo_number}</span>
          <Badge variant="outline" className={statusColor[wo.status] ?? ""}>
            {WO_STATUS_LABELS[wo.status] ?? wo.status}
          </Badge>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: info + status */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detail Servis</CardTitle>
              <CardDescription>
                {wo.service_type} • Prioritas: {WO_PRIORITY_LABELS[wo.priority] ?? wo.priority}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-2 text-sm">
                  <UserIcon className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-muted-foreground text-xs">Pelanggan</p>
                    <p className="font-medium">{wo.customer?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{wo.customer?.phone ?? ""}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Car className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-muted-foreground text-xs">Kendaraan</p>
                    <p className="font-medium">
                      {wo.vehicle ? `${wo.vehicle.brand} ${wo.vehicle.model}` : "—"}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{wo.vehicle?.plate ?? ""}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Wrench className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-muted-foreground text-xs">Mekanik</p>
                    <p className="font-medium">{wo.mechanic?.name ?? "Belum ditentukan"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <FileText className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-muted-foreground text-xs">Keluhan</p>
                    <p>{wo.complaint || "—"}</p>
                  </div>
                </div>
              </div>

              {actions.length > 0 && canWrite && (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  {actions.map((a) => (
                    <Button
                      key={a.status}
                      variant={a.variant ?? "default"}
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(() => workOrdersApi.updateStatus(wo.id, a.status))
                      }
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {a.label}
                    </Button>
                  ))}
                </div>
              )}

              {wo.status === "menunggu_approval" && canWrite && (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  <p className="w-full text-sm text-muted-foreground">
                    Ada tambahan biaya menunggu persetujuan ({pendingCount} item/part).
                  </p>
                  <Button size="sm" onClick={() => void run(() => workOrdersApi.approve(wo.id))} disabled={busy}>
                    <Check className="h-4 w-4" /> Setujui
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setConfirmReject(true)} disabled={busy}>
                    <X className="h-4 w-4" /> Tolak & Hapus
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Labor items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Jasa Pengerjaan</CardTitle>
                <CardDescription>
                  {items.filter((i) => i.is_approved).length} jasa tercatat
                </CardDescription>
              </div>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={() => setItemModal(true)}>
                  <Plus className="h-4 w-4" /> Tambah Jasa
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada jasa.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                      <div>
                        <p className="font-medium">
                          {it.name}
                          {!it.is_approved && (
                            <Badge variant="outline" className="ml-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                              Menunggu
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(it.qty)} × {formatRupiah(it.unit_price)}
                          {it.est_hours > 0 && ` • ${formatNumber(it.est_hours)} jam`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{formatRupiah(it.line_total)}</span>
                        {canWrite && (
                          <Button
                            variant="outline"
                            size="icon-xs"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void run(() => workOrdersApi.removeItem(wo.id, it.id))}
                            disabled={busy}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Parts */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Sparepart</CardTitle>
                <CardDescription>
                  {parts.filter((p) => p.is_approved).length} part tercatat
                </CardDescription>
              </div>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={() => setPartModal(true)}>
                  <Package className="h-4 w-4" /> Klaim Part
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {parts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada sparepart.</p>
              ) : (
                <div className="space-y-2">
                  {parts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                      <div>
                        <p className="font-medium">
                          {p.sparepart?.name ?? `Part #${p.sparepart_id}`}
                          {!p.is_approved && (
                            <Badge variant="outline" className="ml-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                              Menunggu
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(p.qty)} × {formatRupiah(p.unit_price)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{formatRupiah(p.line_total)}</span>
                        {canWrite && (
                          <Button
                            variant="outline"
                            size="icon-xs"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void run(() => workOrdersApi.removePart(wo.id, p.id))}
                            disabled={busy}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: total + invoice */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Total Biaya</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimasi</span>
                <span className="font-semibold tabular-nums">{formatRupiah(wo.estimate_total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tagihan</span>
                <span className="font-semibold tabular-nums">{formatRupiah(wo.actual_total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice</CardTitle>
            </CardHeader>
            <CardContent>
              {wo.invoice ? (
                <div className="space-y-2 text-sm">
                  <p className="font-mono text-xs">{wo.invoice.invoice_no}</p>
                  <Badge variant="outline" className={wo.invoice.status === "paid" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"}>
                    {wo.invoice.status === "paid" ? "Lunas" : wo.invoice.status === "partial" ? "Sebagian" : "Belum Lunas"}
                  </Badge>
                  <p className="font-semibold tabular-nums">{formatRupiah(wo.invoice.total)}</p>
                  {canInvoice && (
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link to="/admin/invoices">Lihat Invoice</Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {wo.status === "selesai" || wo.status === "diambil"
                      ? "WO selesai — buat invoice untuk menagih."
                      : "Invoice dibuat setelah WO selesai."}
                  </p>
                  {canInvoice && (wo.status === "selesai" || wo.status === "diambil") && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        void run(async () => {
                          await invoicesApi.create({ work_order_id: wo.id, discount: 0, tax_rate: 0 })
                          navigate("/admin/invoices")
                        })
                      }
                      disabled={busy}
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      Buat Invoice
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Waktu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs text-muted-foreground">
              <p>Dibuat: {new Date(wo.created_at).toLocaleString("id-ID")}</p>
              <p>Mulai: {wo.started_at ? new Date(wo.started_at).toLocaleString("id-ID") : "—"}</p>
              <p>Selesai: {wo.finished_at ? new Date(wo.finished_at).toLocaleString("id-ID") : "—"}</p>
              <p>Diambil: {wo.completed_at ? new Date(wo.completed_at).toLocaleString("id-ID") : "—"}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <AddItemModal
        open={itemModal}
        woId={wo.id}
        onClose={() => setItemModal(false)}
        onSaved={() => {
          setItemModal(false)
          void load()
        }}
      />
      <AddPartModal
        open={partModal}
        woId={wo.id}
        onClose={() => setPartModal(false)}
        onSaved={() => {
          setPartModal(false)
          void load()
        }}
      />
      <ConfirmDialog
        open={confirmReject}
        title="Tolak tambahan biaya?"
        description={
          <>
            Semua jasa & part berstatus <b>menunggu</b> akan dihapus, stok part akan
            dikembalikan, dan WO kembali ke status dikerjakan.
          </>
        }
        confirmLabel="Tolak"
        destructive
        onClose={(ok) => {
          setConfirmReject(false)
          if (ok) void run(() => workOrdersApi.reject(wo.id))
        }}
      />
    </div>
  )
}

function AddItemModal({
  open,
  woId,
  onClose,
  onSaved,
}: {
  open: boolean
  woId: number
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [qty, setQty] = useState("1")
  const [price, setPrice] = useState("")
  const [hours, setHours] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName("")
      setQty("1")
      setPrice("")
      setHours("")
      setError(null)
    }
  }, [open])

  const handleSave = async () => {
    setError(null)
    if (!name.trim()) {
      setError("Nama jasa wajib diisi")
      return
    }
    setSaving(true)
    try {
      await workOrdersApi.addItem(woId, {
        name: name.trim(),
        qty: Number(qty) || 1,
        unit_price: Number(price) || 0,
        est_hours: Number(hours) || 0,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menambah jasa")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Tambah Jasa Pengerjaan"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Tambah
          </Button>
        </>
      }
    >
      {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="space-y-2">
        <Label htmlFor="item-name">Nama Jasa *</Label>
        <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jasa Tune Up" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="item-qty">Qty</Label>
          <NumberInput id="item-qty" value={Number(qty) || 0} onValueChange={(n) => setQty(String(n))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="item-price">Harga</Label>
          <NumberInput id="item-price" value={Number(price) || 0} onValueChange={(n) => setPrice(String(n))} placeholder="75000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="item-hours">Jam (est.)</Label>
          <NumberInput id="item-hours" value={Number(hours) || 0} maxFraction={1} onValueChange={(n) => setHours(String(n))} placeholder="1" />
        </div>
      </div>
    </ModalShell>
  )
}

function AddPartModal({
  open,
  woId,
  onClose,
  onSaved,
}: {
  open: boolean
  woId: number
  onClose: () => void
  onSaved: () => void
}) {
  const [parts, setParts] = useState<Sparepart[]>([])
  const [partId, setPartId] = useState("")
  const [qty, setQty] = useState("1")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setPartId("")
    setQty("1")
    setError(null)
    void sparepartsApi
      .list()
      .then((r) => setParts(r.spareparts ?? []))
      .catch(() => setParts([]))
  }, [open])

  const selected = parts.find((p) => String(p.id) === partId)

  const handleSave = async () => {
    setError(null)
    if (!partId || !Number(qty)) {
      setError("Pilih sparepart dan jumlah")
      return
    }
    setSaving(true)
    try {
      await workOrdersApi.addPart(woId, { sparepart_id: Number(partId), qty: Number(qty) })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengklaim part")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Klaim Sparepart"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Klaim
          </Button>
        </>
      }
    >
      {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="space-y-2">
        <Label htmlFor="part-select">Sparepart *</Label>
        <select
          id="part-select"
          value={partId}
          onChange={(e) => setPartId(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none"
        >
          <option value="">— Pilih sparepart —</option>
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.sku} (stok {formatNumber(p.stock_qty)} {p.unit}, {formatRupiah(p.sell_price)})
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <p className="text-xs text-muted-foreground">
          Stok tersedia: {formatNumber(selected.stock_qty)} {selected.unit} • Harga jual: {formatRupiah(selected.sell_price)}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="part-qty">Jumlah *</Label>
        <NumberInput id="part-qty" value={Number(qty) || 0} maxFraction={2} onValueChange={(n) => setQty(String(n))} placeholder="1" />
      </div>
    </ModalShell>
  )
}
