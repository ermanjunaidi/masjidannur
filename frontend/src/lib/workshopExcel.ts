// Generic xlsx import/export/template helpers for all workshop domains.
// Lazy-imports SheetJS so the ~400KB payload only loads on first use.

import { ApiError, customersApi, vehiclesApi, sparepartsApi, workOrdersApi, invoicesApi } from "./api"
import type { Customer, Sparepart, WorkOrder, Invoice } from "./types"

// ─── Lazy SheetJS loader ───────────────────────────────────────────────────────
type XLSXModule = typeof import("xlsx")
let xlsxCache: XLSXModule | null = null
async function loadXlsx(): Promise<XLSXModule> {
  if (!xlsxCache) {
    xlsxCache = await import("xlsx")
  }
  return xlsxCache
}

// ─── Generic helpers ───────────────────────────────────────────────────────────

export interface DomainColumn {
  key: string
  label: string
  required?: boolean
}

export async function downloadTemplate(
  filename: string,
  columns: DomainColumn[],
  sampleRows: Record<string, string>[],
): Promise<void> {
  const XLSX = await loadXlsx()
  const header = columns.map(c => c.label)
  const data = [header, ...sampleRows.map(r => columns.map(c => r[c.key] ?? ""))]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = columns.map(() => ({ wch: 22 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Data")
  XLSX.writeFile(wb, filename)
}

export async function exportToXlsx(
  filename: string,
  columns: DomainColumn[],
  rows: Record<string, string>[],
): Promise<void> {
  const XLSX = await loadXlsx()
  const header = columns.map(c => c.label)
  const data = [header, ...rows.map(r => columns.map(c => r[c.key] ?? ""))]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = columns.map(() => ({ wch: 22 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Data")
  XLSX.writeFile(wb, filename)
}

export async function readXlsxFile(
  file: File,
  columns?: DomainColumn[],
): Promise<Record<string, string>[]> {
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array", cellDates: true })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) throw new Error("File xlsx tidak memiliki sheet")
  const ws = wb.Sheets[firstSheetName]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false })

  // Normalize a header so "No. HP", "No HP", "nohp", "No_HP" all map to the
  // same token.
  const normalise = (k: string) =>
    k.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

  // Build header label → column key mapping so template headers (Nama, No. HP)
  // match the parser keys (name, phone). Falls back to the normalized header.
  const headerMap: Record<string, string> = {}
  if (columns) {
    for (const c of columns) {
      headerMap[normalise(c.label)] = c.key
      headerMap[normalise(c.key)] = c.key
    }
  }

  return json.map(row => {
    const norm: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) {
      const token = normalise(k)
      const key = headerMap[token] ?? token
      norm[key] = v == null ? "" : String(v)
    }
    return norm
  })
}

// ─── Parsed import row ─────────────────────────────────────────────────────────

export interface ImportRow {
  rowIndex: number
  errors: string[]
  warnings: string[]
}

export interface ImportOutcome {
  rowIndex: number
  status: "success" | "error"
  message: string
}

// ─── Customers ─────────────────────────────────────────────────────────────────

export const CUSTOMER_COLUMNS: DomainColumn[] = [
  { key: "name", label: "Nama", required: true },
  { key: "phone", label: "No. HP", required: true },
  { key: "email", label: "Email" },
  { key: "address", label: "Alamat" },
  { key: "notes", label: "Catatan" },
  { key: "vehicle_plate", label: "Plat Kendaraan" },
  { key: "vehicle_brand", label: "Merek Kendaraan" },
  { key: "vehicle_model", label: "Model Kendaraan" },
  { key: "vehicle_type", label: "Tipe (motor/mobil)" },
  { key: "vehicle_year", label: "Tahun" },
]

export const CUSTOMER_SAMPLE_ROWS: Record<string, string>[] = [
  { name: "Budi Santoso", phone: "081234567890", email: "budi@email.com", address: "Jl. Merdeka No.1", notes: "", vehicle_plate: "B 1234 ABC", vehicle_brand: "Honda", vehicle_model: "Vario 125", vehicle_type: "motor", vehicle_year: "2023" },
  { name: "Siti Rahayu", phone: "081298765432", email: "", address: "", notes: "", vehicle_plate: "", vehicle_brand: "", vehicle_model: "", vehicle_type: "", vehicle_year: "" },
]

export interface ParsedCustomerRow extends ImportRow {
  data: { name: string; phone: string; email?: string; address?: string; notes?: string }
  vehicle?: { plate: string; brand: string; model?: string; type?: string; year?: number }
}

export function parseCustomerRows(raw: Record<string, string>[]): ParsedCustomerRow[] {
  return raw.map((r, idx) => {
    const errors: string[] = []
    const warnings: string[] = []
    const name = r.name?.trim() ?? ""
    const phone = r.phone?.trim() ?? ""
    if (!name) errors.push("Nama wajib diisi")
    if (!phone) errors.push("No. HP wajib diisi")
    let vehicle: ParsedCustomerRow["vehicle"]
    const plate = r.vehicle_plate?.trim() ?? ""
    if (plate) {
      const brand = r.vehicle_brand?.trim() ?? ""
      if (!brand) warnings.push("Plat kendaraan diisi tapi merek kosong — kendaraan tidak dibuat")
      else {
        vehicle = { plate, brand, model: r.vehicle_model?.trim(), type: r.vehicle_type?.trim(), year: Number(r.vehicle_year) || 0 }
      }
    }
    return { rowIndex: idx + 2, errors, warnings, data: { name, phone, email: r.email?.trim(), address: r.address?.trim(), notes: r.notes?.trim() }, vehicle }
  })
}

export async function applyCustomerRow(row: ImportRow): Promise<ImportOutcome> {
  const r = row as ParsedCustomerRow
  try {
    const cust = await customersApi.create({ name: r.data.name, phone: r.data.phone, email: r.data.email, address: r.data.address, notes: r.data.notes })
    if (r.vehicle) {
      await vehiclesApi.create({ customer_id: cust.id, plate: r.vehicle.plate, brand: r.vehicle.brand, model: r.vehicle.model, type: r.vehicle.type, year: r.vehicle.year })
    }
    return { rowIndex: r.rowIndex, status: "success", message: "Pelanggan dibuat" + (r.vehicle ? " + kendaraan" : "") }
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "Gagal impor"
    return { rowIndex: r.rowIndex, status: "error", message: msg }
  }
}

export function customerToRow(c: Customer): Record<string, string> {
  const v = c.vehicles?.[0]
  return {
    name: c.name, phone: c.phone, email: c.email || "", address: c.address || "", notes: c.notes || "",
    vehicle_plate: v?.plate ?? "", vehicle_brand: v?.brand ?? "", vehicle_model: v?.model ?? "", vehicle_type: v?.type ?? "", vehicle_year: v?.year ? String(v.year) : "",
  }
}

// ─── Spareparts ────────────────────────────────────────────────────────────────

export const SPAREPART_COLUMNS: DomainColumn[] = [
  { key: "sku", label: "SKU", required: true },
  { key: "name", label: "Nama", required: true },
  { key: "category", label: "Kategori" },
  { key: "brand", label: "Merek" },
  { key: "unit", label: "Satuan" },
  { key: "buy_price", label: "Harga Beli" },
  { key: "sell_price", label: "Harga Jual" },
  { key: "stock_qty", label: "Stok Awal" },
  { key: "reorder_point", label: "Stok Minimum" },
]

export const SPAREPART_SAMPLE_ROWS: Record<string, string>[] = [
  { sku: "OIL-10W30", name: "Oli Mesin 10W-30", category: "Oli", brand: "Shell", unit: "liter", buy_price: "30000", sell_price: "45000", stock_qty: "20", reorder_point: "5" },
]

export interface ParsedSparepartRow extends ImportRow {
  data: { sku: string; name: string; category?: string; brand?: string; unit?: string; buy_price?: number; sell_price?: number; stock_qty?: number; reorder_point?: number }
}

export function parseSparepartRows(raw: Record<string, string>[]): ParsedSparepartRow[] {
  return raw.map((r, idx) => {
    const errors: string[] = []
    const sku = r.sku?.trim() ?? ""
    const name = r.name?.trim() ?? ""
    if (!sku) errors.push("SKU wajib diisi")
    if (!name) errors.push("Nama wajib diisi")
    return {
      rowIndex: idx + 2, errors, warnings: [],
      data: { sku, name, category: r.category?.trim(), brand: r.brand?.trim(), unit: r.unit?.trim() || "pcs", buy_price: Number(r.buy_price) || 0, sell_price: Number(r.sell_price) || 0, stock_qty: Number(r.stock_qty) || 0, reorder_point: Number(r.reorder_point) || 0 },
    }
  })
}

export async function applySparepartRow(row: ImportRow): Promise<ImportOutcome> {
  const r = row as ParsedSparepartRow
  try {
    await sparepartsApi.create(r.data)
    return { rowIndex: r.rowIndex, status: "success", message: "Sparepart dibuat" }
  } catch (e) {
    return { rowIndex: r.rowIndex, status: "error", message: e instanceof ApiError ? e.message : "Gagal impor" }
  }
}

export function sparepartToRow(p: Sparepart): Record<string, string> {
  return { sku: p.sku, name: p.name, category: p.category || "", brand: p.brand || "", unit: p.unit, buy_price: String(p.buy_price), sell_price: String(p.sell_price), stock_qty: String(p.stock_qty), reorder_point: String(p.reorder_point) }
}

// ─── Work Orders ───────────────────────────────────────────────────────────────

export const WORKORDER_COLUMNS: DomainColumn[] = [
  { key: "customer_phone", label: "No. HP Pelanggan", required: true },
  { key: "plate", label: "Plat Kendaraan", required: true },
  { key: "service_type", label: "Jenis Servis" },
  { key: "complaint", label: "Keluhan" },
  { key: "priority", label: "Prioritas (normal/cepat/darurat)" },
]

export const WORKORDER_SAMPLE_ROWS: Record<string, string>[] = [
  { customer_phone: "081234567890", plate: "B 1234 ABC", service_type: "Servis Rutin", complaint: "Ganti oli", priority: "normal" },
]

export interface ParsedWorkOrderRow extends ImportRow {
  phone: string
  plate: string
  data: { service_type?: string; complaint?: string; priority?: string }
}

export function parseWorkOrderRows(raw: Record<string, string>[]): ParsedWorkOrderRow[] {
  return raw.map((r, idx) => {
    const errors: string[] = []
    const phone = r.customer_phone?.trim() ?? ""
    const plate = r.plate?.trim() ?? ""
    if (!phone) errors.push("No. HP pelanggan wajib diisi")
    if (!plate) errors.push("Plat kendaraan wajib diisi")
    return { rowIndex: idx + 2, errors, warnings: [], phone, plate, data: { service_type: r.service_type?.trim(), complaint: r.complaint?.trim(), priority: r.priority?.trim() || "normal" } }
  })
}

export async function applyWorkOrderRow(row: ImportRow): Promise<ImportOutcome> {
  const r = row as ParsedWorkOrderRow
  try {
    // Lookup customer by phone, vehicle by plate
    const cust = await customersApi.byPhone(r.phone)
    const veh = await vehiclesApi.byPlate(r.plate)
    await workOrdersApi.create({ customer_id: cust.id, vehicle_id: veh.id, service_type: r.data.service_type, complaint: r.data.complaint, priority: r.data.priority })
    return { rowIndex: r.rowIndex, status: "success", message: "WO dibuat" }
  } catch (e) {
    return { rowIndex: r.rowIndex, status: "error", message: e instanceof ApiError ? e.message : "Gagal impor" }
  }
}

export function workOrderToRow(wo: WorkOrder): Record<string, string> {
  return { customer_phone: wo.customer?.phone ?? "", plate: wo.vehicle?.plate ?? "", service_type: wo.service_type || "", complaint: wo.complaint || "", priority: wo.priority }
}

// ─── Payments (import via invoice) ─────────────────────────────────────────────

export const PAYMENT_COLUMNS: DomainColumn[] = [
  { key: "invoice_no", label: "No. Invoice", required: true },
  { key: "amount", label: "Jumlah", required: true },
  { key: "method", label: "Metode (tunai/transfer/qris)" },
]

export const PAYMENT_SAMPLE_ROWS: Record<string, string>[] = [
  { invoice_no: "INV-20260827-00001", amount: "100000", method: "tunai" },
]

export interface ParsedPaymentRow extends ImportRow {
  invoiceNo: string
  amount: number
  method: string
}

export function parsePaymentRows(raw: Record<string, string>[]): ParsedPaymentRow[] {
  return raw.map((r, idx) => {
    const errors: string[] = []
    const invoiceNo = r.invoice_no?.trim() ?? ""
    const amount = Number(r.amount) || 0
    if (!invoiceNo) errors.push("No. Invoice wajib diisi")
    if (amount <= 0) errors.push("Jumlah harus lebih dari 0")
    return { rowIndex: idx + 2, errors, warnings: [], invoiceNo, amount, method: r.method?.trim() || "tunai" }
  })
}

export async function applyPaymentRow(row: ImportRow): Promise<ImportOutcome> {
  const r = row as ParsedPaymentRow
  try {
    const inv = await invoicesApi.byNumber(r.invoiceNo)
    await invoicesApi.addPayment(inv.id, { amount: r.amount, method: r.method })
    return { rowIndex: r.rowIndex, status: "success", message: `Pembayaran ${r.amount} dicatat` }
  } catch (e) {
    return { rowIndex: r.rowIndex, status: "error", message: e instanceof ApiError ? e.message : "Gagal impor" }
  }
}

export function invoiceToRow(inv: Invoice): Record<string, string> {
  return { invoice_no: inv.invoice_no, amount: "", method: "", status: inv.status, total: String(inv.total), customer: inv.work_order?.customer?.name ?? "" }
}