// Lightweight modal wrapper using the existing card/button UI primitives.
// shadcn Dialog component is not in the project yet so we keep it
// portable: a fixed-position overlay plus ESC-to-close semantics.

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { X, Loader2 } from "lucide-react"

interface ModalShellProps {
  open: boolean
  onClose: () => void
  title: string
  // ReactNode rather than plain string so callers can include inline
  // markup (e.g. <code> for filenames) without dropping to dangerouslySetInnerHTML.
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  // maxWidth defaults to lg; override for tighter forms like ConfirmDialog.
  // "full" = full-screen overlay (dipakai utk preview gambar dll.)
  size?: "sm" | "md" | "lg" | "full"
}

export function ModalShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "lg",
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Simpan onClose di ref: effect ESC/scroll-lock hanya bergantung pada
  // `open`. Tanpa ini, re-render parent (mis. setelah refresh daftar)
  // membuat effect re-run di tengah modal terbuka → cleanup scroll-lock
  // merekam "hidden" sebagai prev → body nyangkut terkunci setelah modal
  // ditutup (halaman jadi tidak bisa di-scroll di mobile).
  // Assign via effect (bukan saat render) — penulisan ref saat render
  // melanggar aturan react-hooks.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  // Close on ESC — keyboard ergonomics for power users. Untuk modal
  // bersarang (VehicleModal → form kendaraan) hanya dialog TERAKHIR yang
  // dibuka yang boleh menutup; tanpa ini satu tekan ESC menutup semua
  // modal sekaligus dan pengguna kehilangan isi form induknya.
  // Dialog nested dirender DI DALAM DOM induknya, jadi urutan
  // querySelectorAll = urutan stacking → yang terakhir = yang teratas.
  // Handler hanya terpasang saat open=true (guard di bawah), jadi tidak
  // perlu openRef terpisah.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const dialogs = document.querySelectorAll<HTMLElement>(
        "[role=dialog][aria-modal=true]",
      )
      const top = dialogs[dialogs.length - 1]
      if (top && dialogRef.current && top === dialogRef.current) {
        e.preventDefault()
        onCloseRef.current()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  // Lock background scroll while open (mobile: modal dan page tidak
  // ikut ke-scroll bersamaan). prev-restore pattern agar nested modal
  // (mis. VehicleModal + form kendaraan) tidak saling membuka lock.
  // Deps hanya [open] — lihat komentar onCloseRef di atas.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl", full: "max-w-full" }
  const fullscreen = size === "full"
  // Height cap is set DIRECTLY on the Card using a viewport calc (always a
  // definite value). Setting `max-h` on the wrapper + `max-h-full` on the
  // Card does NOT work: percentage heights resolve against the parent's
  // *height* (auto here), so the cap was silently ignored and tall modals
  // overflowed the screen on mobile. With a definite Card max-height, the
  // CardContent scroll area below actually engages.
  //
  // Mobile layout = bottom sheet: menempel ke bawah (items-end) dengan
  // sudut atas membulat, mengikuti pola UI native. max-h memperhitungkan
  // safe-area iOS (home indicator) supaya footer tidak tertutup.
  const cardMaxH =
    "max-h-[calc(100dvh-env(safe-area-inset-bottom)-1rem)] sm:max-h-[calc(100dvh-2rem)]"
  return (
    <div
      className={`fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm ${
        fullscreen
          ? "items-stretch p-0"
          : "items-end justify-center p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:items-center sm:p-4 sm:pb-4"
      }`}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${fullscreen ? "h-full w-full" : `w-full ${widths[size]} flex min-h-0 flex-col`}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Card
          className={
            fullscreen
              ? "h-full rounded-none border-0"
              : `flex min-h-0 w-full flex-col rounded-b-none rounded-t-2xl sm:rounded-b-xl sm:rounded-t-xl ${cardMaxH}`
          }
        >
          <CardHeader className="flex flex-row items-start justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent
            className={`min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain ${
              fullscreen ? "flex flex-col" : ""
            }`}
          >
            {children}
          </CardContent>
          {footer && (
            // Footer STICKY di luar area scroll: tombol aksi selalu terlihat
            // meski konten modal di-scroll (sebelumnya footer ikut ke-scroll
            // dan tombol Simpan hilang dari pandangan di layar pendek).
            <div className="shrink-0 border-t bg-card px-(--card-spacing) py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
              <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                {footer}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─── UserModal ────────────────────────────────────────────────────────────────

import { usersApi, ApiError, type InviteResult } from "@/lib/api"
import type { Role, User } from "@/lib/types"

interface UserModalProps {
  open: boolean
  mode: "create" | "edit"
  initialUser?: User | null
  availableRoles: Role[]
  onClose: () => void
  onSaved: (saved: User) => void
}

export function UserModal({
  open,
  mode,
  initialUser,
  availableRoles: allRoles,
  onClose,
  onSaved,
}: UserModalProps) {
  // superadmin is platform-level: never assignable from the tenant user
  // management UI (backend also strips it as a second line of defense).
  const availableRoles = allRoles.filter((r) => r.name !== "superadmin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [selectedRoleIDs, setSelectedRoleIDs] = useState<number[]>([])
  const [isActive, setIsActive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Set after create / resend when the invite link must be shared manually.
  const [invite, setInvite] = useState<InviteResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Reset form state every time the modal opens with a different target.
  useEffect(() => {
    if (!open) return
    setName(initialUser?.name ?? "")
    setEmail(initialUser?.email ?? "")
    setPassword("") // always start empty: blank = no change
    setSelectedRoleIDs(initialUser?.roles?.map((r) => r.id) ?? [])
    setIsActive(initialUser?.is_active ?? true)
    setError(null)
    setSaving(false)
    setInvite(null)
    setNotice(null)
  }, [open, initialUser])

  const errorText = (e: unknown, fallback: string) =>
    e instanceof ApiError
      ? `${e.message} (HTTP ${e.status})`
      : e instanceof Error
      ? e.message
      : fallback

  const handleResendInvite = async () => {
    if (!initialUser) return
    setError(null)
    setNotice(null)
    setSaving(true)
    try {
      const res = await usersApi.resendInvite(initialUser.id)
      if (res.invite_link) setInvite(res)
      else setNotice(`Undangan dikirim ulang ke ${initialUser.email}.`)
    } catch (e) {
      setError(errorText(e, "Gagal mengirim undangan"))
    } finally {
      setSaving(false)
    }
  }

  const toggleRole = (id: number) => {
    setSelectedRoleIDs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleSave = async () => {
    setError(null)
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required")
      return
    }
    setSaving(true)
    try {
      if (mode === "create") {
        // The admin never sets the password: the backend emails an invite
        // (set password, or sign in with Google using this email). An
        // email that already has an account is rejected with 409 instead
        // of creating a duplicate.
        const res = await usersApi.create({
          name: name.trim(),
          email: email.trim(),
          role_ids: selectedRoleIDs,
        })
        if (res.invite_link) {
          // Keep the modal open so the admin can copy the link.
          setInvite(res)
        } else {
          onSaved(res.user)
        }
      } else if (initialUser) {
        const payload: Parameters<typeof usersApi.update>[1] = {
          name: name.trim(),
          email: email.trim(),
          is_active: isActive,
          role_ids: selectedRoleIDs,
        }
        if (password) {
          payload.password = password
        }
        const updated = await usersApi.update(initialUser.id, payload)
        onSaved(updated)
      }
    } catch (e) {
      setError(errorText(e, "Save failed"))
    } finally {
      setSaving(false)
    }
  }

  if (invite?.invite_link) {
    const done = () => {
      if (mode === "create") onSaved(invite.user)
      else setInvite(null)
    }
    return (
      <ModalShell
        open={open}
        onClose={done}
        title="Bagikan link undangan"
        description={`Email belum terkirim (SMTP belum dikonfigurasi). Kirim link ini ke ${invite.user.email}.`}
        footer={<Button onClick={done}>Selesai</Button>}
      >
        <div className="space-y-2">
          <Label htmlFor="invite-link">Link undangan (berlaku 7 hari)</Label>
          <div className="flex gap-2">
            <Input id="invite-link" readOnly value={invite.invite_link} onFocus={(e) => e.target.select()} />
            <Button
              variant="outline"
              onClick={() => void navigator.clipboard?.writeText(invite.invite_link ?? "")}
            >
              Salin
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            User membuat password lewat link ini, atau cukup pilih "Masuk dengan Google"
            memakai email yang sama.
          </p>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Create user" : `Edit ${initialUser?.name ?? "user"}`}
      description={
        mode === "create"
          ? "Undangan dikirim ke email user. User membuat password sendiri, atau masuk dengan Google memakai email yang sama."
          : "Leave the password blank to keep the existing password."
      }
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="user-name">Name</Label>
          <Input
            id="user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-email">Email</Label>
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            // email is locked once created; admins cannot steal accounts by
            // silently rewiring a password-reset vector.
            disabled={mode === "edit"}
          />
        </div>
      </div>

      {mode === "edit" && (
        <div className="space-y-2">
          <Label htmlFor="user-password">
            New password{" "}
            <span className="text-muted-foreground font-normal">
              (optional — leave blank to keep)
            </span>
          </Label>
          <Input
            id="user-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>
      )}

      {notice && (
        <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          {notice}
        </div>
      )}

      {mode === "edit" && initialUser && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 bg-muted/30 text-sm">
          <span className="text-muted-foreground">Metode login:</span>
          {initialUser.has_password && <span className="font-medium">Password</span>}
          {initialUser.google_linked && <span className="font-medium">Google</span>}
          {!initialUser.has_password && !initialUser.google_linked && (
            <>
              <span className="font-medium">Belum aktif (menunggu undangan)</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => void handleResendInvite()}
                disabled={saving}
              >
                Kirim ulang undangan
              </Button>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Roles</Label>
        {availableRoles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No roles defined yet. Create roles from the Roles tab first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 rounded-lg border p-3 bg-muted/30">
            {availableRoles.map((role) => {
              const checked = selectedRoleIDs.includes(role.id)
              return (
                <label
                  key={role.id}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                    checked
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleRole(role.id)}
                  />
                  <span className="font-medium">{role.name}</span>
                  <span
                    className={`text-xs ${
                      checked
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    {role.permissions.length} perms
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {mode === "edit" && (
        <div className="flex items-center gap-2">
          <input
            id="user-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border"
          />
          <Label htmlFor="user-active" className="cursor-pointer">
            Account is active
          </Label>
        </div>
      )}
    </ModalShell>
  )
}
