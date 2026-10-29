// Shared TypeScript types for the Buku Masjid frontend. Hand-maintained
// (no zod/codegen) to match the master template's portable philosophy.

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
  /** 0 = platform-level account (superadmin), otherwise the organization. */
  organization_id: number
  /** false = Google-only or invite not yet accepted (no password set). */
  has_password: boolean
  google_linked: boolean
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
  { label: "Buku Kas", prefix: "books" },
  { label: "Kategori", prefix: "categories" },
  { label: "Transaksi", prefix: "transactions" },
  { label: "Laporan", prefix: "reports" },
  { label: "Settings", prefix: "settings" },
  { label: "Users", prefix: "users" },
  { label: "Roles & Permissions", prefix: "roles" },
]

// ─── Buku Masjid domain types ───────────────────────────────────────────────

export interface Organization {
  id: number
  name: string
  phone: string
  email: string
  address: string
  /** Future subdomain (<slug>.<domain>). */
  slug: string | null
  created_at: string
  updated_at: string
}

export interface Book {
  id: number
  name: string
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: number
  book_id: number
  name: string
  group: "pendapatan" | "pengeluaran"
  description: string
  book?: Book
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: number
  book_id: number
  category_id: number
  date: string // YYYY-MM-DD
  type: "pemasukan" | "pengeluaran"
  amount: number
  description: string
  partner_name: string
  ref_no: string
  book?: Book
  category?: Category
  creator?: { id: number; name: string; email: string }
  created_at: string
  updated_at: string
}

// ─── Jadwal Pengajian & Khatib (Lecturing) ──────────────────────────────

export type LecturingAudience = "friday" | "public" | "muslimah" | "tarawih"

export interface Lecturing {
  id: number
  audience: LecturingAudience
  date: string // YYYY-MM-DD
  start_time: string // HH:MM, boleh kosong
  end_time: string // HH:MM, kosong = s/d selesai
  time_text: string // label bebas, mis. "Ba'da Maghrib"
  lecturer_name: string
  imam_name: string
  muadzin_name: string
  title: string
  book_title: string
  book_writer: string
  video_link: string
  audio_link: string
  description: string
  creator?: { id: number; name: string; email: string }
  created_at: string
  updated_at: string
}

export const AUDIENCE_LABELS: Record<LecturingAudience, string> = {
  friday: "Khatib Jumat",
  public: "Pengajian Umum",
  muslimah: "Pengajian Muslimah",
  tarawih: "Tarawih",
}

export interface MasjidSettings {
  id: number
  organization_id: number
  slug: string
  name: string
  address: string
  city_name: string
  latitude: number
  longitude: number
  phone: string
  email: string
  currency_code: string
  report_footer: string
  updated_by: number
  created_at: string
  updated_at: string
}

// ─── Public Display types ───────────────────────────────────────────────────

export interface PublicDisplayFinance {
  month: string
  income: number
  expense: number
  net: number
  start_cash: number
  current_cash: number
}

export interface PublicDisplayData {
  masjid: MasjidSettings
  finance: PublicDisplayFinance
  lecturings: Lecturing[]
  recent_transactions: Transaction[]
  books: Book[]
  server_time: string
}

// ─── Report types ────────────────────────────────────────────────────────────

export interface ReportTotals {
  income: number
  expense: number
  net: number
  start_cash: number
  end_cash: number
}

export interface LedgerEntry {
  id: number
  date: string
  description: string
  category: string
  partner_name: string
  ref_no: string
  income: number
  expense: number
}

export interface MonthlyReport {
  month: string // YYYY-MM
  book_id: number
  totals: ReportTotals
  rows: LedgerEntry[]
}

export interface CategoryReportRow {
  id: number
  name: string
  group: string
  income: number
  expense: number
  count: number
}

export interface CategoryReportResponse {
  totals: ReportTotals
  rows: CategoryReportRow[]
}

export interface WeekEntry {
  start: string
  end: string
  income: number
  expense: number
  net: number
}

export interface WeeklyReport {
  from: string
  to: string
  weeks: WeekEntry[]
  totals: ReportTotals
}

export const TYPE_LABELS: Record<string, string> = {
  pemasukan: "Pemasukan",
  pengeluaran: "Pengeluaran",
}

/** Nomor nota kwitansi: pakai no. bukti manual (ref_no) jika terisi,
 *  kalau kosong fallback ke ID transaksi dalam 5 digit (mis. "00042"). */
export function nomorNota(tx: { id: number; ref_no?: string }): string {
  return tx.ref_no?.trim() || String(tx.id).padStart(5, "0")
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

/** Today's date as YYYY-MM-DD (local timezone). */
export function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Current month as YYYY-MM (local timezone). */
export function currentMonth(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
