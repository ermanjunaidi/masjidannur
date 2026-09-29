// Shared TypeScript types mirroring the backend models.User / Role /
// Permission shapes. Kept hand-maintained (no zod/codegen) to match
// the master template's portable, zero-bundler-magic philosophy.

export interface Permission {
  id: number
  key: string
  name: string
  created_at: string
}

export interface Role {
  id: number
  name: string
  description: string
  permissions: Permission[]
  created_at: string
  updated_at: string
}

export interface User {
  id: number
  name: string
  email: string
  is_active: boolean
  daily_wage: number
  daily_allowance: number
  roles: Role[]
  created_at: string
  updated_at: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface ApiErrorBody {
  error?: string
  message?: string
}

// Default permission catalog mirror — kept in sync with backend
// `defaultPermissionCatalog`. Used by the role-builder matrix UI to
// render grouped, sensible defaults even when the API is briefly
// unreachable.
export interface PermissionGroup {
  label: string
  prefix: string
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  { label: "Dashboard", prefix: "dashboard" },
  { label: "Users", prefix: "users" },
  { label: "Roles & Permissions", prefix: "roles" },
  { label: "Customers", prefix: "customers" },
  { label: "Vehicles", prefix: "vehicles" },
  { label: "Work Orders", prefix: "workorders" },
  { label: "Spareparts & Stock", prefix: "spareparts" },
  { label: "Invoices", prefix: "invoices" },
  { label: "Reports", prefix: "reports" },
  { label: "Analytics", prefix: "analytics" },
  { label: "Settings", prefix: "settings" },
]

// ─── Workshop domain types (TAMZ Garage) ───────────────────────────────────

export interface Organization {
  id: number
  name: string
  phone: string
  email: string
  address: string
  created_at: string
  updated_at: string
}

export interface Customer {
  id: number
  name: string
  phone: string
  email: string
  address: string
  notes: string
  vehicles?: Vehicle[]
  created_at: string
  updated_at: string
}

export interface Vehicle {
  id: number
  customer_id: number
  brand: string
  model: string
  year: number
  plate: string
  vin: string
  type: string
  color: string
  last_km: number
  customer?: Customer
  created_at: string
  updated_at: string
}

export interface Sparepart {
  id: number
  sku: string
  name: string
  category: string
  brand: string
  unit: string
  buy_price: number
  sell_price: number
  stock_qty: number
  reorder_point: number
  image_url: string
  created_at: string
  updated_at: string
}

export interface StockTransaction {
  id: number
  sparepart_id: number
  type: string
  qty: number
  unit_price: number
  ref_type: string
  ref_id: number
  note: string
  created_by: number
  created_at: string
}

export interface WorkOrderItem {
  id: number
  work_order_id: number
  name: string
  qty: number
  unit_price: number
  line_total: number
  est_hours: number
  is_approved: boolean
  created_at: string
}

export interface WorkOrderPart {
  id: number
  work_order_id: number
  sparepart_id: number
  qty: number
  unit_price: number
  line_total: number
  stock_transaction_id: number
  is_approved: boolean
  created_by: number
  sparepart?: Sparepart
  created_at: string
}

export interface WorkOrder {
  id: number
  wo_number: string
  customer_id: number
  vehicle_id: number
  mechanic_id: number
  status: string
  service_type: string
  complaint: string
  priority: string
  estimate_total: number
  actual_total: number
  started_at: string | null
  finished_at: string | null
  completed_at: string | null
  created_by: number
  customer?: Customer
  vehicle?: Vehicle
  mechanic?: User
  items?: WorkOrderItem[]
  parts?: WorkOrderPart[]
  invoice?: Invoice | null
  created_at: string
  updated_at: string
}

export interface Payment {
  id: number
  invoice_id: number
  amount: number
  received: number
  change: number
  method: string
  paid_at: string
  created_by: number
  created_at: string
}

export interface Invoice {
  id: number
  work_order_id: number
  invoice_no: string
  subtotal: number
  discount: number
  tax: number
  total: number
  status: string
  issued_at: string
  paid_at: string | null
  work_order?: WorkOrder
  payments?: Payment[]
  created_at: string
  updated_at: string
}

export interface DashboardSummary {
  today_revenue: number
  today_work_orders: number
  active_work_orders: number
  waiting_work_orders: number
  low_stock_count: number
  total_customers: number
  unpaid_invoice_count: number
  unpaid_invoice_total: number
  queue: QueueEntry[]
  low_stock: LowStockEntry[]
}

export interface QueueEntry {
  id: number
  wo_number: string
  status: string
  priority: string
  customer: string
  plate: string
  mechanic: string
  total: number
  created_at: string
}

export interface LowStockEntry {
  id: number
  sku: string
  name: string
  stock_qty: number
  reorder_point: number
  unit: string
}

// ─── Absensi (PRD-ABSENSI) ───────────────────────────────────────────────────

export interface Shift {
  id: number
  name: string
  branch_id: number
  start_time: string
  end_time: string
  late_tolerance_minutes: number
  allow_overtime: boolean
  is_default: boolean
  created_at: string
}

export interface UserShiftAssignment {
  id: number
  user_id: number
  shift_id: number
  branch_id: number
  start_date: string
  end_date: string
  shift?: Shift
  user?: User
}

export interface AttendanceDay {
  id: number
  organization_id: number
  branch_id: number
  user_id: number
  shift_id: number
  date: string
  status: string
  check_in_at: string | null
  check_out_at: string | null
  late_minutes: number
  work_duration_minutes: number
  check_in_method: string
  latitude: number
  longitude: number
  note: string
  shift?: Shift
  user?: User
}

export interface LeaveRequest {
  id: number
  organization_id: number
  branch_id: number
  user_id: number
  type: string
  start_date: string
  end_date: string
  reason: string
  attachment_url: string
  status: string
  approved_by: number
  decided_at: string | null
  user?: User
  created_at: string
}

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  hadir: "Hadir",
  terlambat: "Terlambat",
  izin: "Izin",
  sakit: "Sakit",
  cuti: "Cuti",
  tanpa_keterangan: "Tanpa Keterangan",
  libur: "Libur",
  belum_absen: "Belum Absen",
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  izin: "Izin",
  sakit: "Sakit",
  cuti: "Cuti",
  tanpa_keterangan: "Tanpa Keterangan",
}

export const WO_STATUSES = [
  "draft",
  "menunggu",
  "dikerjakan",
  "menunggu_approval",
  "selesai",
  "diambil",
  "batal",
] as const

export const WO_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  menunggu: "Menunggu",
  dikerjakan: "Dikerjakan",
  menunggu_approval: "Menunggu Persetujuan",
  selesai: "Selesai",
  diambil: "Diambil",
  batal: "Batal",
}

export const WO_PRIORITIES = ["normal", "cepat", "darurat"] as const

export const WO_PRIORITY_LABELS: Record<string, string> = {
  normal: "Normal",
  cepat: "Cepat",
  darurat: "Darurat",
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

/** Format a plain number with Indonesian thousand separators (dots),
 *  e.g. 1234567 -> "1.234.567". Use for counts, stock, qty, etc. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value || 0)
}
