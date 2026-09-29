// Reusable confirmation dialog used for destructive actions
// (delete user, delete role). Returns a yes/no decision to its
// promise handler — modal stays declarative.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ModalShell } from "@/components/UserModal"
import { Loader2 } from "lucide-react"

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** When true, confirm button uses destructive red variant. */
  destructive?: boolean
  onClose: (confirmed: boolean) => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  const handleConfirm = () => {
    setBusy(true)
    // Tiny delay is intentional: gives the spinner a chance to flash
    // so the user feels acknowledged even on near-instant deletes.
    Promise.resolve().then(() => {
      onClose(true)
      setBusy(false)
    })
  }

  return (
    <ModalShell
      open={open}
      onClose={() => onClose(false)}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onClose(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy}
            variant={destructive ? "destructive" : "default"}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Working...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </>
      }
    >
      {description}
    </ModalShell>
  )
}
