// AdminUsers is a dual-tab page that hosts user CRUD AND roles/permissions
// management in a single route, per the user's "gabung di AdminUsers saja"
// preference. A shadcn Tabs component is not installed in this template,
// so we render a manual segmented control and swap the body content state.

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import UsersTable from "@/components/UsersTable"
import { RolesTable } from "@/components/RolesTable"
import { ApiError, rolesApi, permissionsApi, usersApi } from "@/lib/api"
import type { Permission, Role, User } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"

type Tab = "users" | "roles"

export default function AdminUsers() {
  const { hasPermission } = useAuth()
  const canViewUsers = hasPermission("users:read")
  const canWriteUsers = hasPermission("users:write")
  const canViewRoles = hasPermission("roles:read")
  const canWriteRoles = hasPermission("roles:write")

  const [tab, setTab] = useState<Tab>(canViewRoles ? "roles" : "users")
  // Re-derive tab when permissions resolve asynchronously so a non-admin
  // who landed here first does not get stuck on a hidden tab.
  useEffect(() => {
    if (!canViewRoles && tab === "roles") setTab("users")
  }, [canViewRoles, tab])

  // Users
  const [users, setUsers] = useState<User[]>([])
  const [userErr, setUserErr] = useState<string | null>(null)
  const [userLoading, setUserLoading] = useState(canViewUsers)
  const refreshUsers = useCallback(async () => {
    if (!canViewUsers) {
      setUsers([])
      setUserLoading(false)
      return
    }
    setUserLoading(true)
    setUserErr(null)
    try {
      const resp = await usersApi.list()
      setUsers(resp.users ?? [])
    } catch (e) {
      setUserErr(
        e instanceof ApiError ? `${e.message} (HTTP ${e.status})` : "Load failed",
      )
    } finally {
      setUserLoading(false)
    }
  }, [canViewUsers])
  useEffect(() => {
    void refreshUsers()
  }, [refreshUsers])

  // Roles
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [roleErr, setRoleErr] = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState(canViewRoles)
  const refreshRoles = useCallback(async () => {
    if (!canViewRoles) {
      setRoles([])
      setPermissions([])
      setRoleLoading(false)
      return
    }
    setRoleLoading(true)
    setRoleErr(null)
    try {
      const [r, p] = await Promise.all([rolesApi.list(), permissionsApi.list()])
      setRoles(r.roles ?? [])
      setPermissions(p.permissions ?? [])
    } catch (e) {
      setRoleErr(
        e instanceof ApiError ? `${e.message} (HTTP ${e.status})` : "Load failed",
      )
    } finally {
      setRoleLoading(false)
    }
  }, [canViewRoles])
  useEffect(() => {
    void refreshRoles()
  }, [refreshRoles])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Access control</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage users and the roles + permissions they hold.
        </p>
      </div>

      <div className="inline-flex rounded-lg border bg-muted/30 p-1 gap-1">
        {canViewUsers && (
          <TabButton active={tab === "users"} onClick={() => setTab("users")}>
            Users
            <CountBadge loading={userLoading} value={users.length} />
          </TabButton>
        )}
        {canViewRoles && (
          <TabButton active={tab === "roles"} onClick={() => setTab("roles")}>
            Roles
            <CountBadge loading={roleLoading} value={roles.length} />
          </TabButton>
        )}
      </div>

      {tab === "users" && canViewUsers && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Users</CardTitle>
            <CardDescription>
              All accounts on this platform. Edit name, status, or roles; only
              administrators can delete accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {userErr && (
              <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {userErr}
              </div>
            )}
            <UsersTable
              roles={roles}
              onChanged={() => {
                void refreshUsers()
                void refreshRoles()
              }}
            />
          </CardContent>
        </Card>
      )}

      {tab === "roles" && canViewRoles && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Roles &amp; permissions</CardTitle>
            <CardDescription>
              Roles group permissions. Users receive the union of all permissions
              from every role assigned to them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {roleErr && (
              <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {roleErr}
              </div>
            )}
            <RolesTable
              roles={roles}
              permissions={permissions}
              loading={roleLoading}
              canWrite={canWriteRoles}
              onChanged={() => void refreshRoles()}
            />
          </CardContent>
        </Card>
      )}

      {/* Hide creation affordances when caller lacks write permissions */}
      {!canWriteUsers && tab === "users" && (
        <p className="text-xs text-muted-foreground">
          You can view users but cannot create or edit them.
        </p>
      )}
      {!canWriteRoles && tab === "roles" && (
        <p className="text-xs text-muted-foreground">
          You can view roles but cannot create or edit them.
        </p>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-background shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function CountBadge({
  loading,
  value,
}: {
  loading: boolean
  value: number
}) {
  if (loading) {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  }
  return (
    <span
      className={`ml-1 inline-flex min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold ${
        value > 0
          ? "bg-primary/10 text-primary"
          : "bg-muted-foreground/10 text-muted-foreground"
      }`}
    >
      {value}
    </span>
  )
}
