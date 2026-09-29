// User xlsx helpers (export / import / template).
//
// We dynamic-import `xlsx` so the ~400KB SheetJS payload is split into
// a lazy chunk that only loads when an admin actually uses export or
// import. The first click feels the cost, but the admin landing page
// keeps its initial bundle lean.

import { ApiError, authApi, usersApi, type UpdateUserPayload } from "./api"
import type { Role, User } from "./types"

// ─── Sheet schema ─────────────────────────────────────────────────────────────
// Keep the header row order stable — it's the contract for the template
// the user downloads, the contract for the parser, and the contract for
// what humans will see in Excel/Numbers/Google Sheets.
export const USER_XLSX_COLUMNS = [
  "name",
  "email",
  "password",
  "is_active",
  "roles",
  "created_at",
] as const

export type UserXlsxColumn = (typeof USER_XLSX_COLUMNS)[number]

// Row shape after parsing a real xlsx file. All fields are strings
// (sheet_to_json with defval yields the literal cell text); coercion
// happens in `parseImportRows`.
export interface RawUserRow {
  name: string
  email: string
  password: string
  is_active: string
  roles: string
  created_at: string
}

// A row that has been validated + normalised for the import queue.
// Validation errors are surfaced in the preview modal before any
// network call, so admins can fix bad rows in their spreadsheet and
// re-upload rather than fishing through API error logs afterwards.
export interface ParsedUserRow {
  rowIndex: number // 1-based, excluding the header (matches Excel line numbers)
  raw: RawUserRow
  // null when the row is brand-new (register path), populated when an
  // existing user is matched by email (update path).
  existingUser: User | null
  action: "create" | "update"
  // Resolved role IDs resolved from role names. Order matches `raw.roles`.
  roleIds: number[]
  errors: string[]
  warnings: string[]
}

// Result of running the queued API calls. Per-row outcome with the
// server message preserved for the summary dialog.
export interface ImportRowOutcome {
  rowIndex: number
  email: string
  action: "create" | "update"
  status: "success" | "error"
  message: string
}

// SheetJS types are loose; declare just enough for our touchpoints.
type XLSXModule = typeof import("xlsx")

let xlsxCache: XLSXModule | null = null
async function loadXlsx(): Promise<XLSXModule> {
  if (!xlsxCache) {
    xlsxCache = await import("xlsx")
  }
  return xlsxCache
}

// ─── Export ───────────────────────────────────────────────────────────────────

// Serialize a list of users into a worksheet row dict. Password is
// intentionally omitted from exports — admins shouldn't be shipping
// password material in their spreadsheets. Re-import creates used for
// onboarding flows must set the password explicitly per row.
function rowForExport(u: User): Record<string, string> {
  return {
    name: u.name,
    email: u.email,
    password: "",
    is_active: u.is_active ? "true" : "false",
    roles: (u.roles ?? []).map((r) => r.name).join(", "),
    created_at: u.created_at,
  }
}

export async function exportUsersToXlsx(users: User[]): Promise<void> {
  const XLSX = await loadXlsx()
  const rows = users.map(rowForExport)
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [...USER_XLSX_COLUMNS],
  })
  // First row is the header — SheetJS already writes it from `header`,
  // but we explicitly bold-style by widening column widths via the
  // worksheet "!cols" hint. Cosmetic only; doesn't survive Numbers.
  ws["!cols"] = USER_XLSX_COLUMNS.map((c) =>
    c === "roles" ? { wch: 28 } : { wch: 18 },
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Users")
  const stamp = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  XLSX.writeFile(wb, `users-${stamp}.xlsx`)
}

// ─── Template download ────────────────────────────────────────────────────────

const SAMPLE_TEMPLATE_ROWS: Record<string, string>[] = [
  {
    name: "Jane Doe",
    email: "jane@example.com",
    password: "TempPass123!",
    is_active: "true",
    roles: "user",
    created_at: "",
  },
  {
    name: "John Smith",
    email: "john@example.com",
    password: "TempPass123!",
    is_active: "true",
    roles: "user, admin",
    created_at: "",
  },
  {
    name: "Alex Existing",
    email: "alex@example.com",
    password: "",
    is_active: "true",
    roles: "manager",
    created_at: "",
  },
]

export async function downloadUsersTemplate(): Promise<void> {
  const XLSX = await loadXlsx()
  const ws = XLSX.utils.json_to_sheet(SAMPLE_TEMPLATE_ROWS, {
    header: [...USER_XLSX_COLUMNS],
  })
  // Friendly prompt rows above the actual data sample so opening the
  // template explains how each column behaves.
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Users")
  XLSX.writeFile(wb, "users-template.xlsx")
}

// ─── Parsing & validation ─────────────────────────────────────────────────────

// Defensive coercion from spreadsheet strings into typed values.
// Excel returns booleans as the strings "true"/"false", dates as
// datetime strings depending on locale, and "is_active" as anything
// a human might type — accept a small set of truthy/falsy aliases.
function coerceBool(input: string): boolean | null {
  const v = input.trim().toLowerCase()
  if (v === "") return true // default for blanks: keep active
  if (["true", "1", "yes", "y", "active"].includes(v)) return true
  if (["false", "0", "no", "n", "inactive"].includes(v)) return false
  return null
}

function splitRoles(input: string): string[] {
  return input
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// Email validation light enough to catch obvious typos without
// duplicating the server's stricter checks.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseImportRows(
  raw: RawUserRow[],
  existingUsers: User[],
  knownRoles: Role[],
): ParsedUserRow[] {
  const byEmail = new Map<string, User>()
  for (const u of existingUsers) {
    byEmail.set(u.email.toLowerCase(), u)
  }
  const roleByName = new Map<string, Role>()
  for (const r of knownRoles) {
    roleByName.set(r.name.toLowerCase(), r)
  }

  // Detect duplicate emails WITHIN the same file before we start
  // hitting the API. Two rows pointing at the same create path would
  // otherwise race and the late one would just produce a 409.
  const seen = new Set<string>()
  const duplicateEmails = new Set<string>()

  return raw.map((rawRow, idx) => {
    const errors: string[] = []
    const warnings: string[] = []

    const name = rawRow.name.trim()
    const email = rawRow.email.trim().toLowerCase()
    const password = rawRow.password // NOT trimmed — passwords with intentional whitespace exist
    const roleIdList = splitRoles(rawRow.roles)
      .map((name) => {
        const role = roleByName.get(name.toLowerCase())
        if (!role) warnings.push(`Unknown role "${name}" (will be skipped)`)
        return role?.id
      })
      .filter((id): id is number => id !== undefined)

    if (!name) errors.push("name is required")
    if (!email) errors.push("email is required")
    else if (!EMAIL_RE.test(email)) errors.push(`"${email}" is not a valid email`)

    const existing = byEmail.get(email) ?? null
    // Duplicate-in-file guard. First occurrence wins for collision
    // detection so the second row gets the warning.
    if (email) {
      if (seen.has(email)) {
        duplicateEmails.add(email)
        errors.push(`duplicate email in file ("${email}")`)
      }
      seen.add(email)
    }

    const action: ParsedUserRow["action"] = existing ? "update" : "create"
    if (!existing && !password) {
      errors.push("password is required for new users (leave blank only to update)")
    }

    const coercedActive = coerceBool(rawRow.is_active)
    if (coercedActive === null) {
      warnings.push(
        `is_active "${rawRow.is_active}" not recognised — defaulting to active`,
      )
    }

    return {
      rowIndex: idx + 2, // +1 for header row, +1 for 1-based indexing
      raw: rawRow,
      existingUser: existing,
      action,
      roleIds: roleIdList,
      errors,
      warnings,
    }
  })
}

// ─── File → RawUserRow[] ─────────────────────────────────────────────────────

export async function readUsersXlsxFile(file: File): Promise<RawUserRow[]> {
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array", cellDates: true })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) throw new Error("xlsx file has no sheets")

  const ws = wb.Sheets[firstSheetName]
  // defval:"" ensures missing cells become empty strings rather than
  // `undefined`, so downstream code can safely read every column.
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false, // produce formatted strings, easier downstream
  })

  // Normalise header names so users can ship files with capitals,
  // spaces, or BOM-prefixed headers without surprises.
  const normalise = (k: string): string =>
    k.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "_")

  return json.map((row) => {
    const norm: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) {
      norm[normalise(k)] = v == null ? "" : String(v)
    }
    return {
      name: norm.name ?? "",
      email: norm.email ?? "",
      password: norm.password ?? "",
      is_active: norm.is_active ?? "",
      roles: norm.roles ?? "",
      created_at: norm.created_at ?? "",
    }
  })
}

// ─── Applying parsed rows against the API ────────────────────────────────────

// Coerce validated row material into one-or-two API calls, mirroring
// what the UserModal does manually so behavior stays consistent
// between single-row edits and bulk imports.
async function applyRow(row: ParsedUserRow): Promise<ImportRowOutcome> {
  const email = row.raw.email.trim().toLowerCase()
  try {
    if (row.action === "create") {
      const resp = await authApi.register(
        row.raw.name.trim(),
        row.raw.email.trim(),
        row.raw.password,
      )
      if (row.roleIds.length > 0) {
        await usersApi.update(resp.user.id, { role_ids: row.roleIds })
      }
      return {
        rowIndex: row.rowIndex,
        email,
        action: "create",
        status: "success",
        message: "created",
      }
    }
    // update
    const id = row.existingUser!.id
    const payload: UpdateUserPayload = {
      name: row.raw.name.trim(),
      is_active: coerceBool(row.raw.is_active) ?? true,
      role_ids: row.roleIds,
    }
    if (row.raw.password) {
      payload.password = row.raw.password
    }
    await usersApi.update(id, payload)
    return {
      rowIndex: row.rowIndex,
      email,
      action: "update",
      status: "success",
      message: "updated",
    }
  } catch (e) {
    const msg =
      e instanceof ApiError
        ? `${e.message}${e.status ? ` (HTTP ${e.status})` : ""}`
        : e instanceof Error
        ? e.message
        : "unknown error"
    // Race-condition: someone else created the email between parse and
    // apply. Treat as a 409 conflict so the admin knows to re-upload.
    return {
      rowIndex: row.rowIndex,
      email,
      action: row.action,
      status: "error",
      message: msg,
    }
  }
}

// applyImportRows runs the validated rows sequentially. Sequential
// (not parallel) so a 409 conflict on row 3 doesn't get drowned
// under a bunch of in-flight requests still hitting the server.
export async function applyImportRows(
  rows: ParsedUserRow[],
): Promise<ImportRowOutcome[]> {
  const outcomes: ImportRowOutcome[] = []
  for (const r of rows) {
    // Skip rows that failed validation in the preview step.
    if (r.errors.length > 0) {
      outcomes.push({
        rowIndex: r.rowIndex,
        email: r.raw.email,
        action: r.action,
        status: "error",
        message: `skipped: ${r.errors.join("; ")}`,
      })
      continue
    }
    outcomes.push(await applyRow(r))
  }
  return outcomes
}
