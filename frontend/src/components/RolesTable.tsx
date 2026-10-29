import { useMemo, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Edit2, Trash2, PlusCircle, Power } from "lucide-react"

import { RoleModal } from "@/components/RoleModal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ApiError, rolesApi } from "@/lib/api"
import type { Permission, Role } from "@/lib/types"
import { Pagination } from "@/components/ui/pagination"

interface RolesTableProps {
  roles: Role[]
  permissions: Permission[]
  loading: boolean
  canWrite: boolean
  onChanged: () => void
}

export function RolesTable({
  roles,
  permissions,
  loading,
  canWrite,
  onChanged,
}: RolesTableProps) {
  const [editing, setEditing] = useState<Role | null>(null)
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // superadmin is platform-level — hidden from tenant admin's role list.
  const visibleRoles = useMemo(
    () => roles.filter((r) => r.name !== "superadmin"),
    [roles],
  )

  // Clamp page if a delete (or any reload) brought the dataset
  // below the current page index.  Adjusting state during rendering
  // avoids an effect-driven re-render cascade; we slice using
  // safePage so the rows stay in sync with the footer on the same
  // render where we just clamped page state.
  const totalPages = Math.max(1, Math.ceil(visibleRoles.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  if (page > totalPages) setPage(totalPages)

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return visibleRoles.slice(start, start + pageSize)
  }, [visibleRoles, safePage, pageSize])

  const handlePageChange = (nextPage: number, nextSize: number) => {
    if (nextSize !== pageSize) setPageSize(nextSize)
    setPage(nextPage)
  }

  const handleDelete = async (target: Role) => {
    try {
      await rolesApi.remove(target.id)
      setPendingDelete(null)
      onChanged()
    } catch (e) {
      // Map the backend's "role is currently in use" 400 into a friendlier
      // message tied to the modal state, then close the dialog so the
      // admin can react.
      const msg =
        e instanceof ApiError
          ? `${e.message} (HTTP ${e.status})`
          : e instanceof Error
          ? e.message
          : "Delete failed"
      setPendingDelete(null)
      setDeleteError(msg)
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            New role
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
              <TableHead className="hidden sm:table-cell">Permissions</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No roles yet.
                </TableCell>
              </TableRow>
            ) : (
              paged.map((role) => (
                <TableRow key={role.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Power className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">{role.name}</span>
                    </div>
                    <p className="mt-1 whitespace-normal text-xs text-muted-foreground md:hidden">
                      {role.description} · {role.permissions.length} permissions
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground text-sm md:table-cell">
                    {role.description || (
                      <span className="italic text-muted-foreground/60">
                        no description
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          none
                        </span>
                      ) : (
                        role.permissions.slice(0, 5).map((p) => (
                          <Badge
                            key={p.id}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {p.key}
                          </Badge>
                        ))
                      )}
                      {role.permissions.length > 5 && (
                        <Badge variant="secondary" className="text-[10px]">
                          +{role.permissions.length - 5}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {canWrite && (
                      <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Edit"
                          onClick={() => setEditing(role)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="hover:text-destructive"
                          title="Delete"
                          onClick={() => setPendingDelete(role)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        total={visibleRoles.length}
        page={page}
        pageSize={pageSize}
        onChange={handlePageChange}
        loading={loading}
        itemLabel="roles"
      />

      <RoleModal
        open={creating}
        mode="create"
        permissions={permissions}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false)
          onChanged()
        }}
      />
      <RoleModal
        open={editing !== null}
        mode="edit"
        initialRole={editing}
        permissions={permissions}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          onChanged()
        }}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete role"
        description={
          <>
            Are you sure you want to delete the role{" "}
            <strong>{pendingDelete?.name}</strong>? Roles currently assigned to
            users cannot be removed — clear assignments first.
          </>
        }
        confirmLabel="Delete"
        destructive
        onClose={(confirmed) => {
          if (confirmed && pendingDelete) void handleDelete(pendingDelete)
        }}
      />
      {deleteError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {deleteError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setDeleteError(null)}
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  )
}
