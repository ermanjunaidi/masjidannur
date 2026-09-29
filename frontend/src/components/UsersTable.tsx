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
import { Badge } from "@/components/ui/badge"
import { useEffect, useMemo, useState } from "react"
import {
  Search,
  ArrowUpDown,
  Edit2,
  Trash2,
  Loader2,
  UserPlus,
  Power,
  PowerOff,
} from "lucide-react"
import { ApiError, usersApi } from "@/lib/api"
import type { Role, User } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"
import { UserModal } from "@/components/UserModal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { UserExportImportButtons } from "@/components/ImportUserModal"
import { Pagination } from "@/components/ui/pagination"

interface UsersTableProps {
  roles: Role[]
  onChanged: () => void
}

type SortKey = "name" | "email" | "role" | "status" | "joinedAt"
type SortDir = "asc" | "desc"

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  inactive: "bg-muted text-muted-foreground border-border",
}

function fmtDate(input: string): string {
  try {
    const d = new Date(input)
    if (Number.isNaN(d.valueOf())) return input
    return d.toISOString().slice(0, 10)
  } catch {
    return input
  }
}

export default function UsersTable({ roles, onChanged }: UsersTableProps) {
  const { hasPermission, user: currentUser } = useAuth()
  const canWrite = hasPermission("users:write")
  const canDelete = hasPermission("users:delete")

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("joinedAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [pendingDelete, setPendingDelete] = useState<User | null>(null)

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await usersApi.list()
      setUsers(resp.users ?? [])
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load users"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return users
    return users.filter((u) =>
      [u.name, u.email, ...(u.roles ?? []).map((r) => r.name)].some((v) =>
        v.toLowerCase().includes(q),
      ),
    )
  }, [users, search])

  const sorted = useMemo(() => {
    const getValue = (u: User): string => {
      switch (sortKey) {
        case "name":
          return u.name
        case "email":
          return u.email
        case "role":
          return (u.roles ?? []).map((r) => r.name).join(",") || ""
        case "status":
          return u.is_active ? "active" : "inactive"
        case "joinedAt":
        default:
          return u.created_at
      }
    }
    return [...filtered].sort((a, b) => {
      const av = getValue(a)
      const bv = getValue(b)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  // Snap back to page 1 whenever the user refines their query or
  // changes sort. We adjust state during rendering — the React-blessed
  // pattern for "sync state with derived inputs" — so we don't pay
  // for an extra effect + re-render cycle just to reset a counter.
  //
  // Note: pageSize is intentionally NOT in the signature. Pagination's
  // own setSize handler computes a smart target page so the user stays
  // anchored to their current row; including pageSize here would
  // clobber that jump with a reset to 1.
  const queryKey = `${search}|${sortKey}|${sortDir}`
  const [lastQueryKey, setLastQueryKey] = useState(queryKey)
  if (lastQueryKey !== queryKey) {
    setLastQueryKey(queryKey)
    setPage(1)
  }

  const handleSaved = (saved: User) => {
    setUsers((prev) =>
      prev.some((u) => u.id === saved.id)
        ? prev.map((u) => (u.id === saved.id ? saved : u))
        : [...prev, saved],
    )
    setCreateOpen(false)
    setEditTarget(null)
    onChanged()
  }

  const handleDelete = async (target: User) => {
    setPendingDelete(null)
    try {
      await usersApi.remove(target.id)
      setUsers((prev) => prev.filter((u) => u.id !== target.id))
      onChanged()
    } catch (e) {
      const msg =
        e instanceof ApiError ? `${e.message} (HTTP ${e.status})` : "Delete failed"
      setError(msg)
    }
  }

  const handleToggleActive = async (target: User) => {
    try {
      const updated = await usersApi.update(target.id, {
        is_active: !target.is_active,
      })
      setUsers((prev) => prev.map((u) => (u.id === target.id ? updated : u)))
      onChanged()
    } catch (e) {
      const msg =
        e instanceof ApiError ? `${e.message} (HTTP ${e.status})` : "Update failed"
      setError(msg)
    }
  }

  // Clamp page if deletions shrunk the dataset below the current
  // page index. Same render-phase adjustment as above: setting it
  // during rendering is safe and avoids an effect-driven re-render.
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  if (page > totalPages) setPage(totalPages)

  // Slice using safePage so the displayed rows stay in sync with the
  // footer on the *same* render where we just clamped page state.
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, safePage, pageSize])

  const handlePageChange = (nextPage: number, nextSize: number) => {
    if (nextSize !== pageSize) setPageSize(nextSize)
    setPage(nextPage)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <UserExportImportButtons
              users={users}
              disabled={loading}
              onImported={() => void loadUsers()}
            />
          )}
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Add user
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")}>
                  Name
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton active={sortKey === "email"} dir={sortDir} onClick={() => toggleSort("email")}>
                  Email
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton active={sortKey === "role"} dir={sortDir} onClick={() => toggleSort("role")}>
                  Roles
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")}>
                  Status
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton active={sortKey === "joinedAt"} dir={sortDir} onClick={() => toggleSort("joinedAt")}>
                  Joined
                </SortButton>
              </TableHead>
              {(canWrite || canDelete) && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              paged.map((u) => {
                const isSelf = currentUser?.id === u.id
                return (
                  <TableRow key={u.id} className="group">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{u.name}</span>
                        {isSelf && (
                          <Badge variant="secondary" className="text-[10px]">
                            you
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {!u.roles || u.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            no roles
                          </span>
                        ) : (
                          u.roles.map((r) => (
                            <Badge
                              key={r.id}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {r.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[u.is_active ? "active" : "inactive"]}`}
                      >
                        {u.is_active ? "active" : "inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {fmtDate(u.created_at)}
                    </TableCell>
                    {(canWrite || canDelete) && (
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title={u.is_active ? "Deactivate" : "Activate"}
                              onClick={() => void handleToggleActive(u)}
                            >
                              {u.is_active ? (
                                <PowerOff className="h-3.5 w-3.5" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Edit"
                              onClick={() => setEditTarget(u)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && !isSelf && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="hover:text-destructive"
                              title="Delete"
                              onClick={() => setPendingDelete(u)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && isSelf && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="opacity-30 cursor-not-allowed"
                              title="You cannot delete your own account"
                              disabled
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        total={sorted.length}
        page={page}
        pageSize={pageSize}
        onChange={handlePageChange}
        loading={loading}
        itemLabel="users"
      />

      <UserModal
        open={createOpen}
        mode="create"
        availableRoles={roles}
        onClose={() => setCreateOpen(false)}
        onSaved={handleSaved}
      />
      <UserModal
        open={editTarget !== null}
        mode="edit"
        initialUser={editTarget}
        availableRoles={roles}
        onClose={() => setEditTarget(null)}
        onSaved={handleSaved}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete user"
        description={
          <>
            Are you sure you want to delete <strong>{pendingDelete?.name}</strong>?
            All sessions for this account will be invalidated.
          </>
        }
        confirmLabel="Delete"
        destructive
        onClose={(confirmed) => {
          if (confirmed && pendingDelete) void handleDelete(pendingDelete)
        }}
      />
    </div>
  )
}

function SortButton({
  active,
  dir: _dir,
  onClick,
  children,
}: {
  active: boolean
  // dir is forwarded by callers but currently only the "active" state
  // affects styling; underscore-prefix silences the unused-var lint
  // while keeping the prop in the public API for free.
  dir: SortDir
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 font-medium transition-colors ${
        active ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
      <ArrowUpDown
        className={`h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground/60"}`}
      />
    </button>
  )
}
