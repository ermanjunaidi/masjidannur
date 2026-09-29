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
import {
  Search,
  Loader2,
  UserPlus,
  Plus,
  Pencil,
  Trash2,
  Car,
} from "lucide-react"
import { ApiError, customersApi, vehiclesApi } from "@/lib/api"
import type { Customer, Vehicle } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"
import { XlsxToolbar } from "@/components/XlsxToolbar"
import {
  CUSTOMER_COLUMNS,
  CUSTOMER_SAMPLE_ROWS,
  parseCustomerRows,
  applyCustomerRow,
  customerToRow,
} from "@/lib/workshopExcel"

export default function CustomersPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("customers:write")
  const canDelete = hasPermission("customers:delete")

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null)
  const [vehicleOwner, setVehicleOwner] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await customersApi.list(search || undefined)
      setCustomers(resp.customers ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat pelanggan")
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const filtered = useMemo(() => customers, [customers])
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await customersApi.remove(pendingDelete.id)
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
          <h1 className="text-2xl font-bold tracking-tight">Pelanggan</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Kelola data pelanggan dan kendaraan mereka.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <XlsxToolbar
            columns={CUSTOMER_COLUMNS}
            filename="pelanggan"
            sampleRows={CUSTOMER_SAMPLE_ROWS}
            exportRows={customers.map(customerToRow)}
            parseRows={parseCustomerRows}
            applyRow={applyCustomerRow}
            primaryKey={(r) => (r as { data?: { phone?: string } }).data?.phone ?? ""}
            title="Pelanggan"
            canWrite={canWrite}
            onImported={() => void load()}
          />
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4" /> Tambah Pelanggan
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Pelanggan</CardTitle>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Cari nama / nomor HP..."
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>No. HP</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Kendaraan</TableHead>
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
                    Tidak ada pelanggan.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.email || "—"}
                    </TableCell>
                    <TableCell>
                      {c.vehicles && c.vehicles.length > 0 ? (
                        <span className="text-xs">
                          {c.vehicles
                            .map((v) => `${v.brand} ${v.model} (${v.plate})`)
                            .join(", ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          title="Kendaraan"
                          onClick={() => setVehicleOwner(c)}
                        >
                          <Car className="h-3.5 w-3.5" />
                        </Button>
                        {canWrite && (
                          <Button
                            variant="outline"
                            size="icon-sm"
                            title="Edit"
                            onClick={() => setEditTarget(c)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="outline"
                            size="icon-sm"
                            title="Hapus"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setPendingDelete(c)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
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
              itemLabel="pelanggan"
            />
          </div>
        </CardContent>
      </Card>

      <CustomerModal
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

      <VehicleModal
        customer={vehicleOwner}
        onClose={() => setVehicleOwner(null)}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus pelanggan?"
        description={
          <>
            Pelanggan <b>{pendingDelete?.name}</b> dan seluruh kendaraannya akan
            dihapus. Tindakan ini tidak bisa dibatalkan.
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

// ─── Customer create/edit modal ──────────────────────────────────────────────

function CustomerModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  initial: Customer | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? "")
    setPhone(initial?.phone ?? "")
    setEmail(initial?.email ?? "")
    setAddress(initial?.address ?? "")
    setNotes(initial?.notes ?? "")
    setError(null)
  }, [open, initial])

  const handleSave = async () => {
    setError(null)
    if (!name.trim() || !phone.trim()) {
      setError("Nama dan nomor HP wajib diisi")
      return
    }
    setSaving(true)
    try {
      if (mode === "create") {
        await customersApi.create({ name: name.trim(), phone: phone.trim(), email, address, notes })
      } else if (initial) {
        await customersApi.update(initial.id, { name, phone, email, address, notes })
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
      title={mode === "create" ? "Tambah Pelanggan" : "Edit Pelanggan"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? "Simpan" : "Simpan Perubahan"}
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="c-name">Nama *</Label>
          <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Budi Santoso" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-phone">No. HP *</Label>
          <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-email">Email</Label>
        <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-address">Alamat</Label>
        <Input id="c-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jl. ..." />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-notes">Catatan</Label>
        <Input id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan internal (opsional)" />
      </div>
    </ModalShell>
  )
}

// ─── Vehicle management modal (list + add + edit + delete) ───────────────────

function VehicleModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    brand: "",
    model: "",
    year: "",
    plate: "",
    vin: "",
    type: "motor",
    color: "",
    last_km: "",
  })
  const [formOpen, setFormOpen] = useState(false)
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Vehicle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customer) {
      setFormOpen(false)
      setForm({ brand: "", model: "", year: "", plate: "", vin: "", type: "motor", color: "", last_km: "" })
      setError(null)
    }
  }, [customer])

  if (!customer) return null

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const openAdd = () => {
    setEditVehicle(null)
    setForm({ brand: "", model: "", year: "", plate: "", vin: "", type: "motor", color: "", last_km: "" })
    setFormOpen(true)
  }

  const openEdit = (v: Vehicle) => {
    setEditVehicle(v)
    setForm({
      brand: v.brand,
      model: v.model ?? "",
      year: v.year ? String(v.year) : "",
      plate: v.plate,
      vin: v.vin ?? "",
      type: v.type || "motor",
      color: v.color ?? "",
      last_km: v.last_km ? String(v.last_km) : "",
    })
    setFormOpen(true)
  }

  const handleSaveVehicle = async () => {
    setError(null)
    if (!form.brand.trim() || !form.plate.trim()) {
      setError("Merek dan plat nomor wajib diisi")
      return
    }
    setSaving(true)
    try {
      const payload = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: Number(form.year) || 0,
        plate: form.plate.trim(),
        vin: form.vin.trim(),
        type: form.type,
        color: form.color.trim(),
        last_km: Number(form.last_km) || 0,
      }
      if (editVehicle) {
        await vehiclesApi.update(editVehicle.id, payload)
      } else {
        await vehiclesApi.create({ ...payload, customer_id: customer.id })
      }
      setFormOpen(false)
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan kendaraan")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteVehicle = async () => {
    if (!pendingDelete) return
    try {
      await vehiclesApi.remove(pendingDelete.id)
      setPendingDelete(null)
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus kendaraan")
    }
  }

  return (
    <ModalShell
      open={!!customer}
      onClose={onClose}
      title={`Kendaraan — ${customer.name}`}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {customer.vehicles?.length ?? 0} kendaraan terdaftar.
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Tambah Kendaraan
        </Button>
      </div>

      <div className="space-y-2">
        {(customer.vehicles ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada kendaraan untuk pelanggan ini.
          </p>
        ) : (
          customer.vehicles!.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {v.brand} {v.model} <span className="text-muted-foreground">({v.year || "—"})</span>
                </p>
                <p className="font-mono text-xs text-muted-foreground truncate">
                  {v.plate} • {v.type} {v.color && `• ${v.color}`}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="outline" size="icon-sm" title="Edit" onClick={() => openEdit(v)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="Hapus"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setPendingDelete(v)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {formOpen && (
        <ModalShell
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editVehicle ? "Edit Kendaraan" : "Tambah Kendaraan"}
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button onClick={handleSaveVehicle} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-brand">Merek *</Label>
              <Input id="v-brand" value={form.brand} onChange={set("brand")} placeholder="Honda" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-model">Model</Label>
              <Input id="v-model" value={form.model} onChange={set("model")} placeholder="Vario 125" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-year">Tahun</Label>
              <Input id="v-year" value={form.year} onChange={set("year")} placeholder="2023" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-plate">Plat Nomor *</Label>
              <Input id="v-plate" value={form.plate} onChange={set("plate")} placeholder="B 1234 ABC" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-type">Tipe</Label>
              <select
                id="v-type"
                value={form.type}
                onChange={set("type")}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none"
              >
                <option value="motor">Motor</option>
                <option value="mobil">Mobil</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-color">Warna</Label>
              <Input id="v-color" value={form.color} onChange={set("color")} placeholder="Hitam" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-vin">VIN</Label>
              <Input id="v-vin" value={form.vin} onChange={set("vin")} placeholder="(opsional)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-km">KM Terakhir</Label>
              <Input id="v-km" type="number" value={form.last_km} onChange={set("last_km")} placeholder="5000" />
            </div>
          </div>
        </ModalShell>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus kendaraan?"
        description={
          <>
            Kendaraan <b>{pendingDelete?.brand} {pendingDelete?.plate}</b> akan dihapus.
          </>
        }
        confirmLabel="Hapus"
        destructive
        onClose={(ok) => {
          setPendingDelete(null)
          if (ok) void handleDeleteVehicle()
        }}
      />
    </ModalShell>
  )
}
