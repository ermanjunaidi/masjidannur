import { useCallback, useEffect, useRef, useState } from "react"
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
import { NumberInput } from "@/components/ui/number-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ModalShell } from "@/components/UserModal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Pagination } from "@/components/ui/pagination"
import { Badge } from "@/components/ui/badge"
import { RowActions } from "@/components/RowActions"
import {
  Search,
  Loader2,
  PackagePlus,
  Package,
  ImagePlus,
  Camera,
  GalleryHorizontal,
  Pencil,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  AlertTriangle,
  Eye,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { ApiError, sparepartsApi } from "@/lib/api"
import type { Sparepart, StockTransaction } from "@/lib/types"
import { formatRupiah, formatNumber } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"
import { XlsxToolbar } from "@/components/XlsxToolbar"
import {
  SPAREPART_COLUMNS,
  SPAREPART_SAMPLE_ROWS,
  parseSparepartRows,
  applySparepartRow,
  sparepartToRow,
} from "@/lib/workshopExcel"

export default function SparepartsPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("spareparts:write")
  const canDelete = hasPermission("spareparts:delete")

  const [parts, setParts] = useState<Sparepart[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Sparepart | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Sparepart | null>(null)
  const [stockTarget, setStockTarget] = useState<Sparepart | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Sparepart | null>(null)
  const [imageTarget, setImageTarget] = useState<Sparepart | null>(null)
  const [previewImage, setPreviewImage] = useState<Sparepart | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await sparepartsApi.list(search || undefined)
      setParts(resp.spareparts ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat sparepart")
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const pageItems = parts.slice((page - 1) * pageSize, page * pageSize)

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await sparepartsApi.remove(pendingDelete.id)
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
          <h1 className="text-2xl font-bold tracking-tight">Sparepart & Stok</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Katalog sparepart, stok, dan riwayat transaksi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <XlsxToolbar
            columns={SPAREPART_COLUMNS}
            filename="sparepart"
            sampleRows={SPAREPART_SAMPLE_ROWS}
            exportRows={parts.map(sparepartToRow)}
            parseRows={parseSparepartRows}
            applyRow={applySparepartRow}
            primaryKey={(r) => (r as { data?: { sku?: string } }).data?.sku ?? ""}
            title="Sparepart"
            canWrite={canWrite}
            onImported={() => void load()}
          />
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <PackagePlus className="h-4 w-4" /> Tambah Sparepart
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
          <CardTitle className="text-base">Katalog Sparepart</CardTitle>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Cari SKU / nama / kategori..."
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gambar</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Harga Beli</TableHead>
                <TableHead className="text-right">Harga Jual</TableHead>
                <TableHead className="text-right">Stok</TableHead>
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
                    Tidak ada sparepart.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((p) => {
                  const low = p.stock_qty <= p.reorder_point
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="h-full w-full object-cover"
                              onClick={() => setPreviewImage(p)}
                            />
                          ) : (
                            <Package className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          className="font-medium text-left hover:text-primary hover:underline"
                          onClick={() => setHistoryTarget(p)}
                          title="Lihat detail"
                        >
                          {p.name}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {p.category || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(p.buy_price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(p.sell_price)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            low
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          }
                        >
                          {formatNumber(p.stock_qty)} {p.unit}
                          {low && <AlertTriangle className="ml-1 h-3 w-3" />}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          actions={[
                            {
                              label: "Upload gambar",
                              icon: <ImagePlus className="h-4 w-4" />,
                              onClick: () => setImageTarget(p),
                            },
                            {
                              label: "Lihat gambar",
                              icon: <Eye className="h-4 w-4" />,
                              onClick: () => setPreviewImage(p),
                              disabled: !p.image_url,
                            },
                            {
                              label: "Riwayat stok",
                              icon: <History className="h-4 w-4" />,
                              onClick: () => setHistoryTarget(p),
                            },
                            ...(canWrite
                              ? [
                                  {
                                    label: "Stok masuk/keluar",
                                    icon: <ArrowDownToLine className="h-4 w-4" />,
                                    onClick: () => setStockTarget(p),
                                  },
                                  {
                                    label: "Edit",
                                    icon: <Pencil className="h-4 w-4" />,
                                    onClick: () => setEditTarget(p),
                                  },
                                ]
                              : []),
                            ...(canDelete
                              ? [
                                  {
                                    label: "Hapus",
                                    icon: <Trash2 className="h-4 w-4" />,
                                    onClick: () => setPendingDelete(p),
                                    destructive: true,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          <div className="mt-4">
            <Pagination
              total={parts.length}
              page={page}
              pageSize={pageSize}
              onChange={(p, ps) => {
                setPage(p)
                setPageSize(ps)
              }}
              itemLabel="sparepart"
            />
          </div>
        </CardContent>
      </Card>

      <SparepartModal
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

      <StockAdjustModal
        part={stockTarget}
        onClose={() => setStockTarget(null)}
        onSaved={() => void load()}
      />

      <StockHistoryModal part={historyTarget} onClose={() => setHistoryTarget(null)} />

      <ImageUploadModal
        part={imageTarget}
        onClose={() => setImageTarget(null)}
        onSaved={() => void load()}
      />

      <SparepartImagePreview part={previewImage} onClose={() => setPreviewImage(null)} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus sparepart?"
        description={
          <>
            Sparepart <b>{pendingDelete?.name}</b> akan dihapus dari katalog.
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

function SparepartModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  initial: Sparepart | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    sku: "",
    name: "",
    category: "",
    brand: "",
    unit: "pcs",
    buy_price: "",
    sell_price: "",
    stock_qty: "",
    reorder_point: "0",
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      sku: initial?.sku ?? "",
      name: initial?.name ?? "",
      category: initial?.category ?? "",
      brand: initial?.brand ?? "",
      unit: initial?.unit || "pcs",
      buy_price: initial?.buy_price ? String(initial.buy_price) : "",
      sell_price: initial?.sell_price ? String(initial.sell_price) : "",
      stock_qty: initial?.stock_qty ? String(initial.stock_qty) : "",
      reorder_point: initial?.reorder_point ? String(initial.reorder_point) : "0",
    })
    setError(null)
  }, [open, initial])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setError(null)
    if (!form.sku.trim() || !form.name.trim()) {
      setError("SKU dan nama wajib diisi")
      return
    }
    setSaving(true)
    try {
      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        category: form.category.trim(),
        brand: form.brand.trim(),
        unit: form.unit,
        buy_price: Number(form.buy_price) || 0,
        sell_price: Number(form.sell_price) || 0,
        reorder_point: Number(form.reorder_point) || 0,
      }
      if (mode === "create") {
        await sparepartsApi.create({ ...payload, stock_qty: Number(form.stock_qty) || 0 })
      } else if (initial) {
        await sparepartsApi.update(initial.id, payload)
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
      title={mode === "create" ? "Tambah Sparepart" : "Edit Sparepart"}
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
        <div className="space-y-1.5">
          <Label htmlFor="p-sku">SKU *</Label>
          <Input id="p-sku" value={form.sku} onChange={set("sku")} placeholder="OIL-10W30" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Nama *</Label>
          <Input id="p-name" value={form.name} onChange={set("name")} placeholder="Oli Mesin 10W-30" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-cat">Kategori</Label>
          <Input id="p-cat" value={form.category} onChange={set("category")} placeholder="Oli / Ban / Filter..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-brand">Merek</Label>
          <Input id="p-brand" value={form.brand} onChange={set("brand")} placeholder="Shell" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-unit">Satuan</Label>
          <Input id="p-unit" value={form.unit} onChange={set("unit")} placeholder="pcs / liter" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-buy">Harga Beli</Label>
          <NumberInput id="p-buy" value={Number(form.buy_price) || 0} onValueChange={(n) => setForm(f => ({ ...f, buy_price: String(n) }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-sell">Harga Jual</Label>
          <NumberInput id="p-sell" value={Number(form.sell_price) || 0} onValueChange={(n) => setForm(f => ({ ...f, sell_price: String(n) }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-reorder">Stok Minimum</Label>
          <NumberInput id="p-reorder" value={Number(form.reorder_point) || 0} onValueChange={(n) => setForm(f => ({ ...f, reorder_point: String(n) }))} />
        </div>
        {mode === "create" && (
          <div className="space-y-1.5">
            <Label htmlFor="p-stock">Stok Awal</Label>
            <NumberInput id="p-stock" value={Number(form.stock_qty) || 0} onValueChange={(n) => setForm(f => ({ ...f, stock_qty: String(n) }))} />
          </div>
        )}
      </div>
    </ModalShell>
  )
}

function StockAdjustModal({
  part,
  onClose,
  onSaved,
}: {
  part: Sparepart | null
  onClose: () => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<"in" | "out">("in")
  const [qty, setQty] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (part) {
      setMode("in")
      setQty("")
      setNote("")
      setError(null)
    }
  }, [part])

  if (!part) return null

  const handleSubmit = async () => {
    setError(null)
    const n = Number(qty)
    if (!n || n <= 0) {
      setError("Jumlah harus lebih dari 0")
      return
    }
    setSaving(true)
    try {
      await sparepartsApi.adjust(part.id, mode, n, note || undefined)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyesuaikan stok")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={!!part}
      onClose={onClose}
      title={`Stok — ${part.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSubmit} disabled={saving} variant={mode === "out" ? "destructive" : "default"}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "in" ? "Masuk" : "Keluar"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Stok saat ini: <b>{formatNumber(part.stock_qty)} {part.unit}</b>
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          variant={mode === "in" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("in")}
        >
          <ArrowDownToLine className="h-4 w-4" /> Stok Masuk
        </Button>
        <Button
          variant={mode === "out" ? "destructive" : "outline"}
          size="sm"
          onClick={() => setMode("out")}
        >
          <ArrowUpFromLine className="h-4 w-4" /> Stok Keluar
        </Button>
      </div>
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      <div className="space-y-2">
        <Label htmlFor="adj-qty">Jumlah ({part.unit})</Label>
        <NumberInput id="adj-qty" value={Number(qty) || 0} onValueChange={(n) => setQty(String(n))} placeholder="1" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="adj-note">Catatan</Label>
        <Input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pembelian / retur / rusak..." />
      </div>
    </ModalShell>
  )
}

function StockHistoryModal({
  part,
  onClose,
}: {
  part: Sparepart | null
  onClose: () => void
}) {
  const [txs, setTxs] = useState<StockTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!part) return
    setLoading(true)
    setError(null)
    sparepartsApi
      .stockHistory(part.id)
      .then((r) => setTxs(r.transactions ?? []))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Gagal memuat riwayat"))
      .finally(() => setLoading(false))
  }, [part])

  if (!part) return null

  const typeColor: Record<string, string> = {
    in: "text-emerald-600 dark:text-emerald-400",
    out: "text-destructive",
    adjust: "text-amber-600 dark:text-amber-400",
  }
  const typeLabel: Record<string, string> = { in: "Masuk", out: "Keluar", adjust: "Penyesuaian" }

  return (
    <ModalShell open={!!part} onClose={onClose} title={`Riwayat Stok — ${part.name}`} size="lg">
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : txs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada transaksi stok.</p>
      ) : (
        <div className="space-y-2">
          {txs.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
              <div>
                <p className="font-medium">
                  <span className={typeColor[t.type] ?? ""}>{typeLabel[t.type] ?? t.type}</span>
                  {" · "}
                  {formatNumber(Math.abs(t.qty))} {part.unit}
                  {t.ref_type && <span className="text-muted-foreground"> · ref: {t.ref_type}{t.ref_id ? ` #${t.ref_id}` : ""}</span>}
                </p>
                {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(t.created_at).toLocaleString("id-ID")}
              </p>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

// ─── Upload gambar sparepart ──────────────────────────────────────────────────

function ImageUploadModal({
  part,
  onClose,
  onSaved,
}: {
  part: Sparepart | null
  onClose: () => void
  onSaved: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (part) {
      setFile(null)
      setPreview(part.image_url || null)
      setError(null)
    }
  }, [part])

  if (!part) return null

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith("image/")) {
      setError("File harus berupa gambar (PNG/JPG/WebP)")
      return
    }
    if (f.size > 2 * 1024 * 1024) {
      setError("File maksimal 2MB")
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setError(null)
  }

  const handleUpload = async () => {
    if (!file) {
      setError("Pilih file gambar terlebih dahulu")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await sparepartsApi.uploadImage(part.id, file)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal upload gambar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={!!part}
      onClose={onClose}
      title={`Upload Gambar — ${part.name}`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleUpload} disabled={saving || !file}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Upload
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      <div className="flex items-center justify-center">
        <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          {preview ? (
            <img src={preview} alt={part.name} className="h-full w-full object-cover" />
          ) : (
            <Package className="h-12 w-12 text-muted-foreground" />
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={() => cameraRef.current?.click()}>
          <Camera className="h-4 w-4" /> Ambil Foto
        </Button>
        <Button variant="outline" onClick={() => galleryRef.current?.click()}>
          <GalleryHorizontal className="h-4 w-4" /> Pilih dari Galeri
        </Button>
      </div>
      {/* Kamera (HP: capture langsung) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      {/* Galeri */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFile}
      />
      <p className="text-xs text-muted-foreground text-center">
        Foto dari kamera/HP secara otomatis menyesuaikan. Maksimal 2MB.
      </p>
    </ModalShell>
  )
}

// ─── Preview gambar sparepart (klik thumbnail di tabel) ──────────────────────

function SparepartImagePreview({
  part,
  onClose,
}: {
  part: Sparepart | null
  onClose: () => void
}) {
  // Zoom (pinch / buttons / wheel). Kept local so re-opening resets.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const startRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null)

  if (!part) return null

  const clampZoom = (z: number) => Math.min(4, Math.max(1, z))

  const reset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY !== 0) {
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.2 : -0.2)))
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDragging(true)
    startRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !startRef.current) return
    setPan({
      x: startRef.current.px + (e.clientX - startRef.current.x),
      y: startRef.current.py + (e.clientY - startRef.current.y),
    })
  }
  const onPointerUp = () => {
    setDragging(false)
    startRef.current = null
  }

  // Touch pinch zoom
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      pinchRef.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom,
      }
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      setZoom(clampZoom(pinchRef.current.zoom * (dist / pinchRef.current.dist)))
    }
  }
  const onTouchEnd = () => {
    pinchRef.current = null
  }

  return (
    <ModalShell open={!!part} onClose={onClose} title={part.name} size="full">
      <div className="flex h-full flex-col gap-2">
        <div
          className="relative flex min-h-0 flex-1 w-full items-center justify-center touch-none overflow-hidden rounded-xl border bg-muted"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
        >
          {part.image_url ? (
            <img
              src={part.image_url}
              alt={part.name}
              className="h-full w-full object-contain transition-transform duration-75"
              style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
              draggable={false}
            />
          ) : (
            <Package className="h-16 w-16 text-muted-foreground" />
          )}
        </div>
        {part.image_url && (
          <div className="flex items-center justify-center gap-2 shrink-0">
            <Button variant="outline" size="icon-sm" onClick={() => setZoom((z) => clampZoom(z - 0.25))} disabled={zoom <= 1} title="Perkecil">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => setZoom((z) => clampZoom(z + 0.25))} disabled={zoom >= 4} title="Perbesar">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={reset} disabled={zoom === 1 && pan.x === 0 && pan.y === 0}>
              Reset
            </Button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 text-sm shrink-0 sm:grid-cols-4">
          <p>
            <span className="text-muted-foreground">SKU:</span>{" "}
            <span className="font-mono text-xs">{part.sku}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Stok:</span>{" "}
            <span className="font-semibold">{formatNumber(part.stock_qty)} {part.unit}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Harga Jual:</span>{" "}
            <span className="font-semibold">{formatRupiah(part.sell_price)}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Harga Beli:</span>{" "}
            <span>{formatRupiah(part.buy_price)}</span>
          </p>
        </div>
      </div>
    </ModalShell>
  )
}
