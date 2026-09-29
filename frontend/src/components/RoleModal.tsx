// RoleModal: create/edit a role and configure its permission set.
//
// Layout split into permission groups (Dashboard / Users / Roles / etc.)
// so an admin can see what surface area they're granting at a glance.

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ModalShell } from "@/components/UserModal"
import { rolesApi } from "@/lib/api"
import { ApiError } from "@/lib/api"
import { PERMISSION_GROUPS, type Permission, type Role } from "@/lib/types"
import { Loader2 } from "lucide-react"

interface RoleModalProps {
  open: boolean
  mode: "create" | "edit"
  initialRole?: Role | null
  permissions: Permission[]
  onClose: () => void
  onSaved: (saved: Role) => void
}

function groupPermissions(perms: Permission[]) {
  return PERMISSION_GROUPS.map((group) => ({
    ...group,
    items: perms.filter((p) => p.key.startsWith(group.prefix + ":")),
  })).filter((g) => g.items.length > 0)
}

export function RoleModal({
  open,
  mode,
  initialRole,
  permissions,
  onClose,
  onSaved,
}: RoleModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initialRole?.name ?? "")
    setDescription(initialRole?.description ?? "")
    setSelectedKeys(
      new Set(initialRole?.permissions.map((p) => p.key) ?? []),
    )
    setError(null)
    setSaving(false)
  }, [open, initialRole])

  const groups = groupPermissions(permissions)
  const permIDByKey = new Map(permissions.map((p) => [p.key, p.id]))

  const togglePermission = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleGroup = (group: ReturnType<typeof groupPermissions>[number]) => {
    const allSelected = group.items.every((it) => selectedKeys.has(it.key))
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      group.items.forEach((it) => {
        if (allSelected) next.delete(it.key)
        else next.add(it.key)
      })
      return next
    })
  }

  const handleSave = async () => {
    setError(null)
    if (!name.trim()) {
      setError("Role name is required")
      return
    }
    setSaving(true)
    try {
      const permIDs: number[] = []
      selectedKeys.forEach((key) => {
        const id = permIDByKey.get(key)
        if (typeof id === "number") permIDs.push(id)
      })
      let saved: Role
      if (mode === "create") {
        saved = await rolesApi.create({
          name: name.trim(),
          description: description.trim(),
          permission_ids: permIDs,
        })
      } else if (initialRole) {
        saved = await rolesApi.update(initialRole.id, {
          name: name.trim(),
          description: description.trim(),
          permission_ids: permIDs,
        })
      } else {
        // Defensive: should not reach here because parent passes both.
        throw new Error("RoleModal opened in edit mode without an initial role")
      }
      onSaved(saved)
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? `${e.message} (HTTP ${e.status})`
          : e instanceof Error
          ? e.message
          : "Save failed"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Create role" : `Edit role ${initialRole?.name ?? ""}`}
      description="Roles group permissions. Users gain the union of all permissions from every role they hold."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : mode === "create" ? (
              "Create"
            ) : (
              "Save"
            )}
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="role-name">Name</Label>
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="manager"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-desc">Description</Label>
          <Input
            id="role-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short summary shown in the admin UI"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Permissions</Label>
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No permissions found in catalog.
          </p>
        ) : (
          <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
            {groups.map((group) => {
              const allSelected = group.items.every((it) =>
                selectedKeys.has(it.key),
              )
              const partial =
                !allSelected &&
                group.items.some((it) => selectedKeys.has(it.key))
              return (
                <div key={group.prefix} className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{group.label}</span>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      {allSelected ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.items.map((p) => {
                      const checked = selectedKeys.has(p.key)
                      return (
                        <label
                          key={p.key}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors ${
                            checked
                              ? "border-primary bg-primary/5"
                              : "bg-background hover:bg-muted"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border"
                            checked={checked}
                            onChange={() => togglePermission(p.key)}
                          />
                          <span className="flex-1">
                            <span className="block font-medium">{p.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {p.key}
                            </span>
                          </span>
                          {partial && !checked && (
                            <span className="text-[10px] uppercase text-primary">
                              group
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {selectedKeys.size} permission{selectedKeys.size === 1 ? "" : "s"} selected
        </p>
      </div>
    </ModalShell>
  )
}
