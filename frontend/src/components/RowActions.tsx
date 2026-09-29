// Dropdown untuk aksi per baris di tabel (Edit, Hapus, Upload, Riwayat, dll).
// Di mobile tampil sebagai popup tengah (modal), di desktop sebagai dropdown biasa.

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"

export interface RowAction {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}

export function RowActions({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMobile(window.innerWidth < 640)
  }, [])

  useEffect(() => {
    if (!open) return
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
  }, [open])

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