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
  organization_id: number
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
  /** Buku kas yang boleh diakses user. Kosong = semua buku kas. */
  book_ids?: number[]
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
// Permission groups in the role editor mirror the sidebar: one group per
// menu (same name & order), so an admin sees which menu each permission
// opens. Permissions matching no group are shown under "Lainnya".
export interface PermissionGroup {
  label: string
  /** Sidebar menu(s) these permissions open. */
  menus: string
  /** Permission key prefixes (before ":") belonging to this group. */
  prefixes: string[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  { label: "Dashboard", menus: "Dashboard", prefixes: ["dashboard"] },
  { label: "Buku Kas", menus: "Buku Kas", prefixes: ["books"] },
  { label: "Kategori", menus: "Kategori", prefixes: ["categories"] },
  { label: "Transaksi", menus: "Transaksi", prefixes: ["transactions"] },
  { label: "Pembagian Warga", menus: "Pembagian Warga", prefixes: ["distributions"] },
  { label: "Laporan", menus: "Laporan", prefixes: ["reports"] },
  { label: "Jadwal Pengajian", menus: "Jadwal Pengajian", prefixes: ["lecturings"] },
  { label: "Layar TV (Display)", menus: "Layar TV (Display)", prefixes: ["display"] },
  { label: "Users & Roles", menus: "Users & Roles", prefixes: ["users", "roles"] },
  { label: "Audit Log", menus: "Audit Log", prefixes: ["audit"] },
  { label: "Security", menus: "Security", prefixes: ["security"] },
  { label: "Settings", menus: "Settings", prefixes: ["settings"] },
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
  organization_id?: number
  name: string
  description: string
  is_active: boolean
  /** Buku kas bulan Ramadhan: transaksi bisa berisi beras (kg) dan ada
   *  daftar pembagian ke warga. */
  is_ramadhan?: boolean
  /** Buku kas satu kegiatan PHBI: datanya berdiri sendiri dan bisa
   *  ditutup dengan menyerahkan sisa saldonya ke bendahara. */
  is_phbi?: boolean
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
  /** Beras (kg): diterima pada pemasukan, dibagikan pada pengeluaran.
   *  Hanya di buku kas Ramadhan. 0 = tidak ada. */
  rice_kg?: number
  /** Baris pembagian ke warga (nama = partner_name, plus RT/RW). */
  is_distribution?: boolean
  /** Baris serah terima sisa saldo PHBI (dibuat & diubah lewat Buku Kas). */
  is_settlement?: boolean
  rt?: string
  rw?: string
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

export interface PeriodTotals {
  opening: number
  income: number
  expense: number
  closing: number
}

export interface PeriodBook {
  book_id: number
  name: string
  totals: PeriodTotals
  incomes: LedgerEntry[]
  expenses: LedgerEntry[]
}

export interface PeriodReport {
  from: string
  to: string
  books: PeriodBook[]
  totals: PeriodTotals
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

/** Satu catatan audit: siapa melakukan apa, kapan. */
export interface AuditLog {
  id: number
  user_id: number
  user_name: string
  user_email: string
  /** create | update | delete | export | import | login | login_failed | … */
  action: string
  /** books, transactions, users, auth, … */
  resource: string
  resource_id: number
  method: string
  path: string
  status: number
  ip: string
  /** Data yang dikirim (JSON, rahasia sudah disamarkan). */
  detail: string
  created_at: string
}

/** Satu warga di daftar warga (penerima pembagian). */
export interface Resident {
  id: number
  name: string
  rt: string
  rw: string
  note: string
}

/** Catatan serah terima sisa saldo buku kas PHBI ke bendahara. */
export interface BookSettlement {
  id: number
  book_id: number
  destination_book_id: number
  date: string
  amount: number
  handed_to: string
  note: string
  expense_transaction_id: number
  income_transaction_id: number
  book?: Book
  destination_book?: Book
  created_at: string
  updated_at: string
}

/** Sisa saldo buku kas PHBI dan catatan serah terimanya (null = belum). */
export interface SettlementInfo {
  book_id: number
  book_name: string
  is_phbi: boolean
  balance: number
  settlement: BookSettlement | null
}

/** Ringkasan satu buku kas Ramadhan: masuk, dibagikan, dan sisa. */
export interface RamadhanSummary {
  book_id: number
  income: number
  expense: number
  balance: number
  rice_in: number
  rice_out: number
  rice_balance: number
  recipients: number
  distributed_amount: number
  distributed_rice: number
}

/** Beras dalam kg, mis. 2.5 -> "2,5 kg". */
export function formatKg(value: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value || 0)} kg`
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
