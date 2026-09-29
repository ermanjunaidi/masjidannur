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
import { Pagination } from "@/components/ui/pagination"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Search } from "lucide-react"
import { ApiError, customersApi, workOrdersApi, usersApi } from "@/lib/api"
import type { Customer, Vehicle, WorkOrder, User } from "@/lib/types"
import { WO_STATUS_LABELS, WO_PRIORITY_LABELS, formatRupiah } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"
import { XlsxToolbar } from "@/components/XlsxToolbar"
import {
  WORKORDER_COLUMNS,
  WORKORDER_SAMPLE_ROWS,
  parseWorkOrderRows,
  applyWorkOrderRow,
  workOrderToRow,
} from "@/lib/workshopExcel"

const STATUS_FILTERS = ["", "menunggu", "dikerjakan", "menunggu_approval", "selesai", "diambil", "batal"] as const

export const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  menunggu: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  dikerjakan: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  menunggu_approval: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  selesai: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  diambil: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  batal: "bg-destructive/10 text-destructive border-destructive/20",
}

export default function WorkOrdersPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("workorders:write")

  const [wos, setWos] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("")
  const [date, setDate] = useState("")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await workOrdersApi.list({
        status: status || undefined,
        date: date || undefined,
        q: q || undefined,
      })
      setWos(resp.work_orders ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat work order")
    } finally {
      setLoading(false)
    }
  }, [status, date, q])

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const pageItems = wos.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Work Order</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Daftar pekerjaan servis & antrean bengkel.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <XlsxToolbar
            columns={WORKORDER_COLUMNS}
            filename="work-order"
            sampleRows={WORKORDER_SAMPLE_ROWS}
            exportRows={wos.map(workOrderToRow)}
            parseRows={parseWorkOrderRows}
            applyRow={applyWorkOrderRow}
            primaryKey={(r) => (r as { plate?: string }).plate ?? ""}
            title="Work Order"
            canWrite={canWrite}
            onImported={() => void load()}
          />
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Buat WO
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="Cari nama / plat / no. WO..."
            className="h-8 w-56 pl-8"
          />
        </div>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s)
              setPage(1)
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              status === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {s === "" ? "Semua" : WO_STATUS_LABELS[s]}
          </button>
        ))}
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            setPage(1)
          }}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm focus-visible:outline-none"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Work Order</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. WO</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Kendaraan</TableHead>
                <TableHead>Mekanik</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Tidak ada work order.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((wo) => (
                  <TableRow key={wo.id} className="cursor-pointer" onClick={() => {}}>
                    <TableCell>
                      <Link to={`/admin/work-orders/${wo.id}`} className="font-mono text-xs font-medium hover:underline">
                        {wo.wo_number}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">{WO_PRIORITY_LABELS[wo.priority] ?? wo.priority}</p>
                    </TableCell>
                    <TableCell className="font-medium">{wo.customer?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {wo.vehicle ? `${wo.vehicle.brand} ${wo.vehicle.model} (${wo.vehicle.plate})` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {wo.mechanic?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor[wo.status] ?? ""}>
                        {WO_STATUS_LABELS[wo.status] ?? wo.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatRupiah(wo.actual_total)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="mt-4">
            <Pagination
              total={wos.length}
              page={page}
              pageSize={pageSize}
              onChange={(p, ps) => {
                setPage(p)
                setPageSize(ps)
              }}
              itemLabel="WO"
            />
          </div>
        </CardContent>
      </Card>

      <CreateWOModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false)
          void load()
        }}
      />
    </div>
  )
}

// ─── Create WO modal ──────────────────────────────────────────────────────────

function CreateWOModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { hasPermission } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [mechanics, setMechanics] = useState<User[]>([])
  const [customerId, setCustomerId] = useState("")
  const [vehicleId, setVehicleId] = useState("")
  const [mechanicId, setMechanicId] = useState("")
  const [serviceType, setServiceType] = useState("Servis Rutin")
  const [complaint, setComplaint] = useState("")
  const [priority, setPriority] = useState("normal")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Searchable customer picker: dengan ratusan pelanggan, <select> polos
  // menyulitkan — kasir bisa langsung mengetik nama / no. HP lalu memilih
  // dari hasil filter.
  const [customerQuery, setCustomerQuery] = useState("")
  const [customerListOpen, setCustomerListOpen] = useState(false)

  const selectedCustomer = customers.find((c) => String(c.id) === customerId)

  // Filter klien-side: nama ATAU no. HP mengandung query (case-insensitive).
  // Dataset pelanggan satu bengkel kecil–menengah → filter lokal memadai;
  // daftar dibatasi 50 item saat render agar tidak berat di HP.
  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    )
  }, [customers, customerQuery])

  useEffect(() => {
    if (!open) return
    setError(null)
    setCustomerId("")
    setVehicleId("")
    setCustomerQuery("")
    setCustomerListOpen(false)
    setMechanicId("")
    setServiceType("Servis Rutin")
    setComplaint("")
    setPriority("normal")
    void customersApi.list().then((r) => setCustomers(r.customers ?? [])).catch(() => {})
    if (hasPermission("users:read")) {
      void usersApi.list().then((r) => {
        // Only users likely to be mechanics — for simplicity, all users.
        setMechanics(r.users ?? [])
      }).catch(() => {})
    }
  }, [open, hasPermission])

  const vehicles = selectedCustomer?.vehicles ?? []

  const handleCreate = async () => {
    setError(null)
    if (!customerId || !vehicleId) {
      setError("Pilih pelanggan dan kendaraan")
      return
    }
    setSaving(true)
    try {
      await workOrdersApi.create({
        customer_id: Number(customerId),
        vehicle_id: Number(vehicleId),
        mechanic_id: mechanicId ? Number(mechanicId) : undefined,
        service_type: serviceType,
        complaint,
        priority,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal membuat WO")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Buat Work Order Baru"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Buat WO
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="wo-customer">Pelanggan *</Label>
          <div className="relative">
            <Input
              id="wo-customer"
              type="text"
              autoComplete="off"
              placeholder="Ketik nama / no. HP pelanggan…"
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value)
                // Query berarti pilihan lama tidak lagi pasti → reset
                // supaya kendaraan ikut ter-reset dan WO tidak jebak
                // memakai pelanggan yang sudah dibuang pengguna.
                if (customerId) {
                  setCustomerId("")
                  setVehicleId("")
                }
                setCustomerListOpen(true)
              }}
              onFocus={() => setCustomerListOpen(true)}
              onBlur={() => setCustomerListOpen(false)}
            />
            {customerListOpen && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-background shadow-lg">
                {filteredCustomers.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Tidak ada pelanggan yang cocok.
                  </p>
                ) : (
                  <>
                    {filteredCustomers.slice(0, 50).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        // onMouseDown: jalan sebelum blur menutup daftar.
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setCustomerId(String(c.id))
                          setVehicleId("")
                          setCustomerQuery(`${c.name} (${c.phone})`)
                          setCustomerListOpen(false)
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                    {filteredCustomers.length > 50 && (
                      <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                        Menampilkan 50 dari {filteredCustomers.length} — persempit kata kunci.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wo-vehicle">Kendaraan *</Label>
          <select
            id="wo-vehicle"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none"
            disabled={!customerId}
          >
            <option value="">— Pilih kendaraan —</option>
            {vehicles.map((v: Vehicle) => (
              <option key={v.id} value={v.id}>
                {v.brand} {v.model} ({v.plate})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wo-mechanic">Mekanik</Label>
          <select
            id="wo-mechanic"
            value={mechanicId}
            onChange={(e) => setMechanicId(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none"
          >
            <option value="">— Belum ditentukan —</option>
            {mechanics.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wo-type">Jenis Servis</Label>
          <Input id="wo-type" value={serviceType} onChange={(e) => setServiceType(e.target.value)} placeholder="Servis Rutin" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wo-priority">Prioritas</Label>
          <select
            id="wo-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none"
          >
            <option value="normal">Normal</option>
            <option value="cepat">Cepat</option>
            <option value="darurat">Darurat</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="wo-complaint">Keluhan / Deskripsi</Label>
        <textarea
          id="wo-complaint"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          rows={3}
          placeholder="Deskripsi keluhan kendaraan..."
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm focus-visible:outline-none"
        />
      </div>
    </ModalShell>
  )
}
