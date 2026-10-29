// Network layer for Buku Masjid.
//   - Single apiRequest<T> wrapper injects Authorization header and
//     normalises error shapes from any backend handler in the project.
//   - Domain helpers group the actual HTTP paths so mutation kinds live
//     close together.

import type {
  AuthResponse,
  ApiErrorBody,
  Permission,
  Role,
  User,
  Book,
  Category,
  Transaction,
  MasjidSettings,
  MonthlyReport,
  CategoryReportResponse,
  WeeklyReport,
  Lecturing,
  LecturingAudience,
  PublicDisplayData,
} from "./types"

// Use empty string in dev (Vite proxy handles /api), full URL in production
const API_URL = import.meta.env.VITE_API_URL ?? ""

const TOKEN_KEY = "auth_token"
const USER_KEY = "auth_user"

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export const userStore = {
  get: (): User | null => {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as User
    } catch {
      return null
    }
  },
  set: (user: User) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  clear: () => localStorage.removeItem(USER_KEY),
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = "ApiError"
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  }
  const token = tokenStore.get()
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  const text = await res.text()
  let data: T | ApiErrorBody | null = null
  let jsonParsed = false
  if (text) {
    try {
      data = JSON.parse(text) as T | ApiErrorBody
      jsonParsed = true
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const errBody = data as ApiErrorBody | null
    throw new ApiError(
      errBody?.error || errBody?.message || text || `Request failed (${res.status})`,
      res.status,
    )
  }

  const contentType = res.headers.get("content-type") || ""
  if (contentType.includes("text/html") || !jsonParsed) {
    throw new ApiError("Invalid response from server (non-JSON)", res.status)
  }

  if (!data) {
    throw new ApiError("Response body is empty", res.status)
  }
  return data as T
}

// ─── Public Display ───────────────────────────────────────────────────────────
export const publicApi = {
  getDisplay: (slug?: string) =>
    apiRequest<PublicDisplayData>(slug ? `/api/public/display/${slug}` : "/api/public/display"),
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    apiRequest<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  me: () => apiRequest<User>("/api/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    apiRequest<{ message: string }>("/api/auth/password", {
      method: "PUT",
      body: JSON.stringify({ current_password, new_password }),
    }),
  forgotPassword: (email: string) =>
    apiRequest<{ message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, new_password: string) =>
    apiRequest<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
  // Origin dikirim supaya backend bisa menurunkan redirect URI Google
  // (<origin>/api/auth/google/callback) tanpa konfigurasi tambahan.
  // mode: hanya "register" yang boleh membuat akun baru; keduanya bisa
  // masuk ke akun yang sudah ada.
  googleAuthUrl: (mode: "login" | "register") =>
    `/api/auth/google?origin=${encodeURIComponent(window.location.origin)}&mode=${mode}`,
  googleStatus: () => apiRequest<{ enabled: boolean }>("/api/auth/google/status"),
}

/**
 * Tampilkan tombol Google hanya kalau backend punya GOOGLE_CLIENT_ID/SECRET.
 * Hasil di-cache per page load supaya Login/Register tidak fetch berulang.
 */
let googleEnabledCache: Promise<boolean> | null = null
export function fetchGoogleEnabled(): Promise<boolean> {
  googleEnabledCache ??= authApi
    .googleStatus()
    .then((r) => r.enabled)
    .catch(() => false)
  return googleEnabledCache
}

// ─── Books (Buku Kas) ─────────────────────────────────────────────────────────
export interface CreateBookPayload {
  name: string
  description?: string
}

export interface UpdateBookPayload {
  name?: string
  description?: string
  is_active?: boolean
}

export interface ListBooksResponse {
  books: Book[]
}

export const booksApi = {
  list: () => apiRequest<ListBooksResponse>("/api/books"),
  get: (id: number) => apiRequest<Book>(`/api/books/${id}`),
  create: (payload: CreateBookPayload) =>
    apiRequest<Book>("/api/books", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UpdateBookPayload) =>
    apiRequest<Book>(`/api/books/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/books/${id}`, {
      method: "DELETE",
    }),
}

// ─── Categories (Kategori) ────────────────────────────────────────────────────
export interface ListCategoriesResponse {
  categories: Category[]
}

export interface CreateCategoryPayload {
  book_id: number
  name: string
  group: "pendapatan" | "pengeluaran"
  description?: string
}

export interface UpdateCategoryPayload {
  name?: string
  group?: "pendapatan" | "pengeluaran"
  description?: string
}

export const categoriesApi = {
  list: (params?: { book_id?: number; group?: string }) => {
    const qs = new URLSearchParams()
    if (params?.book_id) qs.set("book_id", String(params.book_id))
    if (params?.group) qs.set("group", params.group)
    const q = qs.toString()
    return apiRequest<ListCategoriesResponse>(
      q ? `/api/categories?${q}` : "/api/categories",
    )
  },
  create: (payload: CreateCategoryPayload) =>
    apiRequest<Category>("/api/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UpdateCategoryPayload) =>
    apiRequest<Category>(`/api/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/categories/${id}`, {
      method: "DELETE",
    }),
}

// ─── Transactions (Pemasukan / Pengeluaran) ───────────────────────────────────
export interface ListTransactionsResponse {
  transactions: Transaction[]
}

export interface CreateTransactionPayload {
  book_id: number
  category_id: number
  date?: string
  type: "pemasukan" | "pengeluaran"
  amount: number
  description?: string
  partner_name?: string
  ref_no?: string
}

export interface UpdateTransactionPayload {
  category_id?: number
  date?: string
  type?: "pemasukan" | "pengeluaran"
  amount?: number
  description?: string
  partner_name?: string
  ref_no?: string
}

export const transactionsApi = {
  list: (params?: {
    book_id?: number
    category_id?: number
    type?: string
    from?: string
    to?: string
    q?: string
  }) => {
    const qs = new URLSearchParams()
    if (params?.book_id) qs.set("book_id", String(params.book_id))
    if (params?.category_id) qs.set("category_id", String(params.category_id))
    if (params?.type) qs.set("type", params.type)
    if (params?.from) qs.set("from", params.from)
    if (params?.to) qs.set("to", params.to)
    if (params?.q) qs.set("q", params.q)
    const query = qs.toString()
    return apiRequest<ListTransactionsResponse>(
      query ? `/api/transactions?${query}` : "/api/transactions",
    )
  },
  create: (payload: CreateTransactionPayload) =>
    apiRequest<Transaction>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UpdateTransactionPayload) =>
    apiRequest<Transaction>(`/api/transactions/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/transactions/${id}`, {
      method: "DELETE",
    }),
}

// ─── Reports (Laporan Kas) ────────────────────────────────────────────────────
export const reportsApi = {
  monthly: (month: string, bookId?: number) => {
    const qs = new URLSearchParams({ month })
    if (bookId) qs.set("book_id", String(bookId))
    return apiRequest<MonthlyReport>(`/api/reports/monthly?${qs.toString()}`)
  },
  category: (from?: string, to?: string, bookId?: number) => {
    const qs = new URLSearchParams()
    if (from) qs.set("from", from)
    if (to) qs.set("to", to)
    if (bookId) qs.set("book_id", String(bookId))
    const q = qs.toString()
    return apiRequest<CategoryReportResponse>(
      q ? `/api/reports/category?${q}` : "/api/reports/category",
    )
  },
  weekly: (from: string, to: string, bookId?: number) => {
    const qs = new URLSearchParams({ from, to })
    if (bookId) qs.set("book_id", String(bookId))
    return apiRequest<WeeklyReport>(`/api/reports/weekly?${qs.toString()}`)
  },
}

// ─── Lecturings (Jadwal Khatib & Pengajian) ───────────────────────
export interface ListLecturingsResponse {
  lecturings: Lecturing[]
}

export interface CreateLecturingPayload {
  audience: LecturingAudience
  date: string
  start_time?: string
  end_time?: string
  time_text?: string
  lecturer_name: string
  imam_name?: string
  muadzin_name?: string
  title?: string
  book_title?: string
  book_writer?: string
  video_link?: string
  audio_link?: string
  description?: string
}

export interface UpdateLecturingPayload {
  audience?: LecturingAudience
  date?: string
  start_time?: string
  end_time?: string
  time_text?: string
  lecturer_name?: string
  imam_name?: string
  muadzin_name?: string
  title?: string
  book_title?: string
  book_writer?: string
  video_link?: string
  audio_link?: string
  description?: string
}

export const lecturingsApi = {
  list: (params?: { audience?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams()
    if (params?.audience) qs.set("audience", params.audience)
    if (params?.from) qs.set("from", params.from)
    if (params?.to) qs.set("to", params.to)
    const q = qs.toString()
    return apiRequest<ListLecturingsResponse>(
      q ? `/api/lecturings?${q}` : "/api/lecturings",
    )
  },
  create: (payload: CreateLecturingPayload) =>
    apiRequest<Lecturing>("/api/lecturings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UpdateLecturingPayload) =>
    apiRequest<Lecturing>(`/api/lecturings/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/lecturings/${id}`, {
      method: "DELETE",
    }),
}

// ─── Masjid Settings (Profil Masjid) ──────────────────────────────────────────
export interface UpdateMasjidSettingsPayload {
  name?: string
  slug?: string
  address?: string
  city_name?: string
  latitude?: number
  longitude?: number
  phone?: string
  email?: string
  currency_code?: string
  report_footer?: string
}

export const masjidSettingsApi = {
  get: () => apiRequest<MasjidSettings>("/api/masjid-settings"),
  update: (payload: UpdateMasjidSettingsPayload) =>
    apiRequest<MasjidSettings>("/api/masjid-settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
}

// ─── Users ────────────────────────────────────────────────────────────────────
export interface ListUsersResponse {
  users: User[]
}

export interface UpdateUserPayload {
  name?: string
  email?: string
  password?: string
  is_active?: boolean
  role_ids?: number[]
}

// No password: the user sets one via the invite link or signs in with
// Google using the same email.
export interface CreateUserPayload {
  name: string
  email: string
  role_ids?: number[]
}

// invite_link is only returned when the email could not be sent (SMTP not
// configured), so the admin can share it manually.
export interface InviteResult {
  user: User
  invite_sent: boolean
  invite_link?: string
}

export const usersApi = {
  list: () => apiRequest<ListUsersResponse>("/api/users"),
  // Admin-side create: joins the CALLING admin's organization (unlike the
  // public /api/auth/register which spins up a brand-new tenant).
  create: (payload: CreateUserPayload) =>
    apiRequest<InviteResult>("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  resendInvite: (id: number) =>
    apiRequest<InviteResult>(`/api/users/${id}/invite`, { method: "POST" }),
  get: (id: number) => apiRequest<User>(`/api/users/${id}`),
  update: (id: number, payload: UpdateUserPayload) =>
    apiRequest<User>(`/api/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/users/${id}`, {
      method: "DELETE",
    }),
}

// ─── Roles ────────────────────────────────────────────────────────────────────
export interface ListRolesResponse {
  roles: Role[]
}

export interface CreateRolePayload {
  name: string
  description: string
  permission_ids: number[]
}

export interface UpdateRolePayload {
  name?: string
  description?: string
  // null leaves existing perms untouched; empty array strips all.
  permission_ids?: number[] | null
}

export const rolesApi = {
  list: () => apiRequest<ListRolesResponse>("/api/roles"),
  create: (payload: CreateRolePayload) =>
    apiRequest<Role>("/api/roles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UpdateRolePayload) =>
    apiRequest<Role>(`/api/roles/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/roles/${id}`, {
      method: "DELETE",
    }),
}

// ─── Permissions (catalog for role-builder) ───────────────────────────────────
export interface ListPermissionsResponse {
  permissions: Permission[]
}

export const permissionsApi = {
  list: () => apiRequest<ListPermissionsResponse>("/api/permissions"),
}
