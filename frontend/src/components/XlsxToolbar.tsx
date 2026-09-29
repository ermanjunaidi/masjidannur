// Reusable xlsx toolbar: a single dropdown containing Template / Export /
// Import actions, backed by the generic ImportModal + workshopExcel helpers.

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Download, FileUp, Loader2, FileSpreadsheet, ImageDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ImportModal } from "@/components/ImportModal"
import {
  downloadTemplate,
  exportToXlsx,
  type DomainColumn,
  type ImportOutcome,
  type ImportRow,
} from "@/lib/workshopExcel"

interface XlsxToolbarProps {
  columns: DomainColumn[]
  filename: string // base filename for template/export (no extension)
  sampleRows: Record<string, string>[]
  // Rows to export (Record keyed by column key). When undefined, export is hidden.
  exportRows?: Record<string, string>[]
  // Validates raw file rows into import rows.
  parseRows: (raw: Record<string, string>[]) => ImportRow[]
  // Applies one validated row.
  applyRow: (row: ImportRow) => Promise<ImportOutcome>
  primaryKey?: (row: ImportRow) => string
  title: string
  canWrite?: boolean
  onImported?: () => void
}

export function XlsxToolbar({
  columns,
  filename,
  sampleRows,
  exportRows,
  parseRows,
  applyRow,
  primaryKey,
  title,
  canWrite = true,
  onImported,
}: XlsxToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<"export" | "template" | null>(null)
  // Dropdown absolute terpotong di layar sempit (menempel ke tepi kanan
  // tombol) → di mobile dirender sebagai bottom sheet fixed seperti
  // RowActions, di desktop tetap dropdown biasa.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    setIsMobile(window.innerWidth < 640)
  }, [])

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
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

  const handleTemplate = async () => {
    setBusy("template")
    try {
      await downloadTemplate(`${filename}-template.xlsx`, columns, sampleRows)
    } finally {
      setBusy(null)
      setOpen(false)
    }
  }
  const handleExport = async () => {
    if (!exportRows) return
    setBusy("export")
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      await exportToXlsx(`${filename}-${stamp}.xlsx`, columns, exportRows)
    } finally {
      setBusy(null)
      setOpen(false)
    }
  }

  // Item menu dipakai kedua varian (dropdown desktop + bottom sheet mobile)
  // supaya behavior tetap identik di kedua layout.
  const menuItems = (
    <>
      <button
        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50"
        onClick={() => void handleTemplate()}
        disabled={busy !== null}
      >
        {busy === "template" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Download Template
        <span className="ml-auto text-[10px] text-muted-foreground">.xlsx</span>
      </button>
      {exportRows !== undefined && (
        <button
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50"
          onClick={() => void handleExport()}
          disabled={busy !== null || exportRows.length === 0}
        >
          {busy === "export" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageDown className="h-4 w-4" />
          )}
          Export Data
        </button>
      )}
      {canWrite && (
        <button
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50"
          onClick={() => {
            setOpen(false)
            fileRef.current?.click()
          }}
        >
          <FileUp className="h-4 w-4" />
          Import dari File
        </button>
      )}
    </>
  )

  return (
    <div className="relative" ref={menuRef}>
      <Button variant="outline" onClick={() => setOpen((o) => !o)} className="gap-2">
        <FileSpreadsheet className="h-4 w-4" />
        <span className="hidden sm:inline">File Excel</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && isMobile && (
        // Mobile: bottom sheet full-width.
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full overflow-hidden rounded-t-2xl border bg-background pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-4 py-2.5 text-sm font-medium">
              {title} — file Excel
            </div>
            {menuItems}
          </div>
        </div>
      )}

      {open && !isMobile && (
        <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border bg-background shadow-lg">
          <div className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {title} — file Excel
          </div>
          {menuItems}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label="Pilih file .xlsx untuk diimpor"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) setPendingFile(file)
        }}
      />
      <ImportModal
        open={pendingFile !== null}
        file={pendingFile}
        columns={columns}
        parseRows={parseRows}
        applyRow={applyRow}
        primaryKey={primaryKey}
        title={title}
        onClose={() => setPendingFile(null)}
        onComplete={() => {
          setPendingFile(null)
          onImported?.()
        }}
      />
    </div>
  )
}
