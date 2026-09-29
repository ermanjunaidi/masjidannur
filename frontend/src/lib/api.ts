// Network layer for the master template.
//   - Single apiRequest<T> wrapper injects Authorization header and
//     normalises error shapes from any backend handler in the project.
//   - Domain helpers (usersApi / rolesApi / permissionsApi) group the
//     actual HTTP paths so mutation kinds live close together.

import type {
  AuthResponse,
  ApiErrorBody,
  Permission,
  Role,
  User,
  Customer,
  Vehicle,
  Sparepart,
  StockTransaction,
  WorkOrder,
  Invoice,
  DashboardSummary,
  Organization,
  AttendanceDay,
  Shift,
  UserShiftAssignment,
  LeaveRequest,
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

// ─── File upload helper (multipart, no Content-Type header) ──────────────────
async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers, body: formData })
  const text = await res.text()
  let data: T | ApiErrorBody | null = null
  if (text) {
    try { data = JSON.parse(text) as T | ApiErrorBody } catch { /* ignore */ }
  }
  if (!res.ok) {
    const errBody = data as ApiErrorBody | null
    throw new ApiError(errBody?.error || text || `Upload failed (${res.status})`, res.status)
  }
  if (!data) throw new ApiError("Upload response empty", res.status)
  return data as T
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
  googleAuthUrl: () => `/api/auth/google`,
}

// ─── Organization (bengkel profile / Settings) ───────────────────────────────
export interface UpdateOrganizationPayload {
  name?: string
  phone?: string
  email?: string
  address?: string
}

export const organizationApi = {
  get: () => apiRequest<Organization>("/api/organization"),
  update: (payload: UpdateOrganizationPayload) =>
    apiRequest<Organization>("/api/organization", {
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
  daily_wage?: number
  daily_allowance?: number
}

export const usersApi = {
  list: () => apiRequest<ListUsersResponse>("/api/users"),
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

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  summary: () => apiRequest<DashboardSummary>("/api/dashboard/summary"),
}

// ─── Customers ────────────────────────────────────────────────────────────────
export interface ListCustomersResponse {
  customers: Customer[]
}

export interface CreateCustomerPayload {
  name: string
  phone: string
  email?: string
  address?: string
  notes?: string
}

export interface UpdateCustomerPayload {
  name?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}

export const customersApi = {
  list: (q?: string) =>
    apiRequest<ListCustomersResponse>(
      q ? `/api/customers?q=${encodeURIComponent(q)}` : "/api/customers",
    ),
  get: (id: number) => apiRequest<Customer>(`/api/customers/${id}`),
  byPhone: (phone: string) =>
    apiRequest<Customer>(`/api/customers/phone/${encodeURIComponent(phone)}`),
  create: (payload: CreateCustomerPayload) =>
    apiRequest<Customer>("/api/customers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UpdateCustomerPayload) =>
    apiRequest<Customer>(`/api/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/customers/${id}`, {
      method: "DELETE",
    }),
}

// ─── Vehicles ─────────────────────────────────────────────────────────────────
export interface CreateVehiclePayload {
  customer_id: number
  brand: string
  model?: string
  year?: number
  plate: string
  vin?: string
  type?: string
  color?: string
  last_km?: number
}

export interface UpdateVehiclePayload {
  brand?: string
  model?: string
  year?: number
  plate?: string
  vin?: string
  type?: string
  color?: string
  last_km?: number
}

export const vehiclesApi = {
  get: (id: number) => apiRequest<Vehicle>(`/api/vehicles/${id}`),
  byPlate: (plate: string) =>
    apiRequest<Vehicle>(`/api/vehicles/plate/${encodeURIComponent(plate)}`),
  create: (payload: CreateVehiclePayload) =>
    apiRequest<Vehicle>("/api/vehicles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UpdateVehiclePayload) =>
    apiRequest<Vehicle>(`/api/vehicles/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/vehicles/${id}`, {
      method: "DELETE",
    }),
}

// ─── Spareparts ───────────────────────────────────────────────────────────────
export interface ListSparepartsResponse {
  spareparts: Sparepart[]
}

export interface CreateSparepartPayload {
  sku: string
  name: string
  category?: string
  brand?: string
  unit?: string
  buy_price?: number
  sell_price?: number
  stock_qty?: number
  reorder_point?: number
}

export interface UpdateSparepartPayload {
  sku?: string
  name?: string
  category?: string
  brand?: string
  unit?: string
  buy_price?: number
  sell_price?: number
  reorder_point?: number
}

export const sparepartsApi = {
  list: (q?: string) =>
    apiRequest<ListSparepartsResponse>(
      q ? `/api/spareparts?q=${encodeURIComponent(q)}` : "/api/spareparts",
    ),
  lowStock: () =>
    apiRequest<ListSparepartsResponse>("/api/spareparts/low-stock"),
  get: (id: number) => apiRequest<Sparepart>(`/api/spareparts/${id}`),
  create: (payload: CreateSparepartPayload) =>
    apiRequest<Sparepart>("/api/spareparts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UpdateSparepartPayload) =>
    apiRequest<Sparepart>(`/api/spareparts/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/spareparts/${id}`, {
      method: "DELETE",
    }),
  stockHistory: (id: number) =>
    apiRequest<{ transactions: StockTransaction[] }>(
      `/api/spareparts/${id}/stock-history`,
    ),
  adjust: (id: number, type: string, qty: number, note?: string) =>
    apiRequest<Sparepart>(`/api/spareparts/${id}/stock`, {
      method: "POST",
      body: JSON.stringify({ type, qty, note }),
    }),
  uploadImage: (id: number, file: File) => {
    const fd = new FormData()
    fd.append("image", file)
    return apiUpload<Sparepart>(`/api/spareparts/${id}/image`, fd)
  },
}

// ─── Work Orders ──────────────────────────────────────────────────────────────
export interface ListWorkOrdersResponse {
  work_orders: WorkOrder[]
}

export interface CreateWorkOrderPayload {
  customer_id: number
  vehicle_id: number
  mechanic_id?: number
  service_type?: string
  complaint?: string
  priority?: string
}

export const workOrdersApi = {
  list: (params?: { status?: string; date?: string; mechanic_id?: number; q?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set("status", params.status)
    if (params?.date) qs.set("date", params.date)
    if (params?.mechanic_id) qs.set("mechanic_id", String(params.mechanic_id))
    if (params?.q) qs.set("q", params.q)
    const query = qs.toString()
    return apiRequest<ListWorkOrdersResponse>(
      query ? `/api/work-orders?${query}` : "/api/work-orders",
    )
  },
  get: (id: number) => apiRequest<WorkOrder>(`/api/work-orders/${id}`),
  create: (payload: CreateWorkOrderPayload) =>
    apiRequest<WorkOrder>("/api/work-orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateStatus: (id: number, status: string) =>
    apiRequest<WorkOrder>(`/api/work-orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  approve: (id: number) =>
    apiRequest<WorkOrder>(`/api/work-orders/${id}/approve`, {
      method: "POST",
    }),
  reject: (id: number) =>
    apiRequest<WorkOrder>(`/api/work-orders/${id}/reject`, {
      method: "POST",
    }),
  addItem: (
    id: number,
    payload: { name: string; qty?: number; unit_price?: number; est_hours?: number },
  ) =>
    apiRequest<WorkOrder>(`/api/work-orders/${id}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeItem: (id: number, itemId: number) =>
    apiRequest<WorkOrder>(`/api/work-orders/${id}/items/${itemId}`, {
      method: "DELETE",
    }),
  addPart: (id: number, payload: { sparepart_id: number; qty: number }) =>
    apiRequest<WorkOrder>(`/api/work-orders/${id}/parts`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removePart: (id: number, partId: number) =>
    apiRequest<WorkOrder>(`/api/work-orders/${id}/parts/${partId}`, {
      method: "DELETE",
    }),
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export interface ListInvoicesResponse {
  invoices: Invoice[]
}

export interface CreateInvoicePayload {
  work_order_id: number
  discount?: number
  tax_rate?: number
}

export const invoicesApi = {
  list: (q?: string) =>
    apiRequest<ListInvoicesResponse>(
      q ? `/api/invoices?q=${encodeURIComponent(q)}` : "/api/invoices",
    ),
  get: (id: number) => apiRequest<Invoice>(`/api/invoices/${id}`),
  byNumber: (no: string) =>
    apiRequest<Invoice>(`/api/invoices/number/${encodeURIComponent(no)}`),
  create: (payload: CreateInvoicePayload) =>
    apiRequest<Invoice>("/api/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  addPayment: (
    id: number,
    payload: { amount: number; method?: string; change?: number; received?: number },
  ) =>
    apiRequest<Invoice>(`/api/invoices/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
}

// ─── Absensi (PRD-ABSENSI) ────────────────────────────────────────────────────

export interface ListAttendanceResponse {
  attendance: AttendanceDay[]
}

export interface ListShiftsResponse {
  shifts: Shift[]
}

export interface ListAssignmentsResponse {
  assignments: UserShiftAssignment[]
}

export interface ListLeavesResponse {
  leaves: LeaveRequest[]
}

export interface SalaryEntry {
  user_id: number
  name: string
  daily_wage: number
  daily_allowance: number
  work_days: number
  late_days: number
  izin_days: number
  absent_days: number
  base_pay: number
  allowance_total: number
  total_salary: number
}

export interface SalaryReportResponse {
  report: SalaryEntry[]
}

export const attendanceApi = {
  checkin: (payload?: { branch_id?: number; latitude?: number; longitude?: number; note?: string }) =>
    apiRequest<AttendanceDay>("/api/attendance/checkin", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),
  checkout: () =>
    apiRequest<AttendanceDay>("/api/attendance/checkout", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  today: () =>
    apiRequest<{ today: AttendanceDay | null }>("/api/attendance/today"),
  list: (params?: { date?: string; status?: string; user_id?: number }) => {
    const qs = new URLSearchParams()
    if (params?.date) qs.set("date", params.date)
    if (params?.status) qs.set("status", params.status)
    if (params?.user_id) qs.set("user_id", String(params.user_id))
    const q = qs.toString()
    return apiRequest<ListAttendanceResponse>(
      q ? `/api/attendance?${q}` : "/api/attendance",
    )
  },
  // Admin manual input (PRD-ABSENSI revisi)
  upsert: (payload: {
    user_id: number
    date: string
    status?: string
    check_in_time?: string
    check_out_time?: string
    work_duration_minutes?: number
    late_minutes?: number
    note?: string
  }) =>
    apiRequest<AttendanceDay>("/api/attendance", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<{ deleted: number }>(`/api/attendance/${id}`, {
      method: "DELETE",
    }),
  report: (from?: string, to?: string) => {
    const qs = new URLSearchParams()
    if (from) qs.set("from", from)
    if (to) qs.set("to", to)
    const q = qs.toString()
    return apiRequest<SalaryReportResponse>(
      q ? `/api/attendance/report?${q}` : "/api/attendance/report",
    )
  },
}

export const shiftsApi = {
  list: () => apiRequest<ListShiftsResponse>("/api/shifts"),
  create: (payload: { name: string; start_time: string; end_time: string; late_tolerance_minutes?: number; allow_overtime?: boolean; is_default?: boolean }) =>
    apiRequest<Shift>("/api/shifts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  assignments: (userId?: number) =>
    apiRequest<ListAssignmentsResponse>(
      userId ? `/api/shifts/assignments?user_id=${userId}` : "/api/shifts/assignments",
    ),
  assign: (payload: { user_id: number; shift_id: number; branch_id?: number; start_date?: string; end_date?: string }) =>
    apiRequest<UserShiftAssignment>("/api/shifts/assign", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
}

export const leavesApi = {
  list: (params?: { status?: string; user_id?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set("status", params.status)
    if (params?.user_id) qs.set("user_id", String(params.user_id))
    const q = qs.toString()
    return apiRequest<ListLeavesResponse>(
      q ? `/api/leaves?${q}` : "/api/leaves",
    )
  },
  create: (payload: { type: string; start_date: string; end_date: string; reason?: string; branch_id?: number }) =>
    apiRequest<LeaveRequest>("/api/leaves", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  decide: (id: number, approve: boolean) =>
    apiRequest<LeaveRequest>(`/api/leaves/${id}/decide`, {
      method: "PATCH",
      body: JSON.stringify({ approve }),
    }),
}
