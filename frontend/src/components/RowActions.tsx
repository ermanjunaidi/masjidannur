// Dropdown untuk aksi per baris di tabel (Edit, Hapus, Upload, Riwayat, dll).
// Bawaan: bottom sheet di mobile, dropdown biasa di desktop.
// Dengan prop `modal`, tombol aksi langsung membuka popup modal di semua
// ukuran layar (dipakai di tabel transaksi).

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ChevronDown, MoreHorizontal } from "lucide-react"
import { ModalShell } from "@/components/UserModal"

export interface RowAction {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}

interface RowActionsProps {
  actions: RowAction[]
  /** Bila diisi, aksi tampil sebagai popup modal (bukan dropdown). */
  modal?: { title: string; description?: ReactNode }
}

export function RowActions({ actions, modal }: RowActionsProps) {
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMobile(window.innerWidth < 640)
  }, [])

  useEffect(() => {
    // Mode modal: ESC & klik-luar sudah ditangani ModalShell.
    if (!open || modal) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    document.addEventListener("keydown", keyHandler)
    return () => {
      document.removeEventListener("mousedown", handler)
      document.removeEventListener("keydown", keyHandler)
    }
  }, [open, modal])

  if (modal) {
    return (
      <>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={modal.title}
          onClick={() => setOpen(true)}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
        <ModalShell
          open={open}
          onClose={() => setOpen(false)}
          title={modal.title}
          description={modal.description}
          size="sm"
        >
          <div className="grid gap-2 text-left">
            {actions.map((a, i) => (
              <button
                key={i}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 ${
                  a.destructive
                    ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                    : ""
                }`}
                onClick={() => {
                  setOpen(false)
                  a.onClick()
                }}
                disabled={a.disabled}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </ModalShell>
      </>
    )
  }

  const items = (
    <>
      {actions.map((a, i) => (
        <button
          key={i}
          className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted disabled:opacity-50 ${
            a.destructive ? "text-destructive hover:text-destructive" : ""
          }`}
          onClick={() => {
            setOpen(false)
            a.onClick()
          }}
          disabled={a.disabled}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </>
  )

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="icon-sm" onClick={() => setOpen((o) => !o)}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && isMobile && (
        // Mobile: bottom sheet (bukan popup tengah) — konsisten dengan
        // ModalShell dan lebih mudah dijangkau jempol.
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            role="menu"
            className="w-full overflow-hidden rounded-t-2xl border bg-background p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {items}
          </div>
        </div>
      )}

      {open && !isMobile && (
        <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-lg border bg-background shadow-lg">
          {items}
        </div>
      )}
    </div>
  )
}