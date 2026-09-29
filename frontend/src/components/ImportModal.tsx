// Reusable two-step import dialog for any xlsx-backed table.
//
//   Step "preview" → parse file rows + validate, show every row with
//                     action / errors so the admin can back out or apply.
//   Step "summary" → outcomes after the apply loop, with success/error
//                     breakdown for fixing bad rows in the spreadsheet.

import { useEffect, useRef, useState } from "react"
import { FileUp, Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ModalShell } from "@/components/UserModal"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { readXlsxFile, type DomainColumn, type ImportOutcome, type ImportRow } from "@/lib/workshopExcel"

interface ImportModalProps {
  open: boolean
  file: File | null
  // Column definitions for header mapping (template label → parser key).
  columns: DomainColumn[]
  // Reads the raw normalized rows into validated import rows.
  parseRows: (raw: Record<string, string>[]) => ImportRow[]
  // Applies ONE validated row; returns success or error outcome.
  applyRow: (row: ImportRow) => Promise<ImportOutcome>
  // Column key used as the primary identifier shown in preview/summary.
  title: string
  primaryKey?: (row: ImportRow) => string
  onClose: () => void
  onComplete?: () => void
}

type Phase =
  | { kind: "loading" }
  | { kind: "preview"; rows: ImportRow[] }
  | { kind: "applying"; rows: ImportRow[] }
  | { kind: "summary"; outcomes: ImportOutcome[] }
  | { kind: "error"; message: string }

export function ImportModal({
  open,
  file,
  columns,
  parseRows,
  applyRow,
  title,
  primaryKey,
  onClose,
  onComplete,
}: ImportModalProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  const applyingRef = useRef(false)

  useEffect(() => {
    if (!open || !file) return
    let cancelled = false
    setPhase({ kind: "loading" })

    void (async () => {
      try {
        const raw = await readXlsxFile(file, columns)
        if (cancelled) return
        const rows = parseRows(raw)
        if (cancelled) return
        setPhase({ kind: "preview", rows })
      } catch (e) {
        if (cancelled) return
        setPhase({
          kind: "error",
          message: e instanceof Error ? e.message : "Gagal membaca file xlsx",
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, file, parseRows])

  const handleApply = async () => {
    if (phase.kind !== "preview") return
    if (applyingRef.current) return
    applyingRef.current = true
    try {
      const rows = phase.rows
      setPhase({ kind: "applying", rows })
      const outcomes: ImportOutcome[] = []
      for (const r of rows) {
        if (r.errors.length > 0) {
          outcomes.push({
            rowIndex: r.rowIndex,
            status: "error",
            message: `dilewati: ${r.errors.join("; ")}`,
          })
          continue
        }
        outcomes.push(await applyRow(r))
      }
      setPhase({ kind: "summary", outcomes })
      if (outcomes.some((o) => o.status === "success")) {
        onComplete?.()
      }
    } finally {
      applyingRef.current = false
    }
  }

  const titleText = (() => {
    switch (phase.kind) {
      case "loading":
        return "Membaca file…"
      case "preview":
        return `Review ${phase.rows.length} baris`
      case "applying":
        return "Memproses impor…"
      case "summary":
        return "Impor selesai"
      case "error":
        return "Impor gagal"
    }
  })()

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`${title} — ${titleText}`}
      description={
        file && (
          <span>
            Mengimpor dari <code className="font-mono">{file.name}</code>
          </span>
        )
      }
      size="lg"
      footer={
        <Footer
          phase={phase}
          onClose={onClose}
          onApply={() => void handleApply()}
        />
      }
    >
      {phase.kind === "loading" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Mem-parsing file…
        </div>
      )}

      {phase.kind === "error" && <ErrorBlock message={phase.message} />}

      {phase.kind === "preview" && (
        <PreviewTable rows={phase.rows} primaryKey={primaryKey} />
      )}
      {phase.kind === "applying" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memproses {phase.rows.length} baris… mohon tunggu.
        </div>
      )}
      {phase.kind === "summary" && <SummaryBlock outcomes={phase.outcomes} />}
    </ModalShell>
  )
}

function PreviewTable({
  rows,
  primaryKey,
}: {
  rows: ImportRow[]
  primaryKey?: (row: ImportRow) => string
}) {
  const errorRows = rows.filter((r) => r.errors.length > 0).length
  const okRows = rows.length - errorRows
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          {okRows} siap
        </Badge>
        {errorRows > 0 && (
          <Badge variant="destructive" className="text-xs">
            {errorRows} bermasalah
          </Badge>
        )}
      </div>
      // Mobile: kolom "#" disembunyikan (hidden sm:table-cell) dan pesan
      // status boleh wrap — whitespace-nowrap bawaan Table membuat pesan
      // error panjang memaksa tabel melebar jauh dari layar HP.
      <div className="max-h-96 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden w-12 sm:table-cell">#</TableHead>
              {primaryKey && <TableHead>Identitas</TableHead>}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={primaryKey ? 3 : 2}
                  className="h-24 text-center text-muted-foreground"
                >
                  Tidak ada baris data di file.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const hasError = r.errors.length > 0
                return (
                  <TableRow key={r.rowIndex} className={hasError ? "bg-destructive/5" : ""}>
                    <TableCell className="hidden text-muted-foreground text-xs sm:table-cell">
                      {r.rowIndex}
                    </TableCell>
                    {primaryKey && (
                      <TableCell className="font-mono text-xs">
                        {primaryKey(r) || (
                          <span className="italic text-muted-foreground">(kosong)</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="space-y-1 text-xs whitespace-normal">
                      {hasError && (
                        <Badge variant="destructive" className="text-[10px]">
                          <XCircle className="mr-1 h-3 w-3" />
                          bermasalah
                        </Badge>
                      )}
                      {r.errors.map((e, i) => (
                        <div key={`e${i}`} className="text-destructive">
                          {e}
                        </div>
                      ))}
                      {r.warnings.map((w, i) => (
                        <div key={`w${i}`} className="text-amber-600 dark:text-amber-400">
                          {w}
                        </div>
                      ))}
                      {!hasError && r.warnings.length === 0 && (
                        <span className="text-muted-foreground">OK</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function SummaryBlock({ outcomes }: { outcomes: ImportOutcome[] }) {
  const success = outcomes.filter((o) => o.status === "success").length
  const failed = outcomes.filter((o) => o.status === "error").length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {success} berhasil
        </Badge>
        {failed > 0 && (
          <Badge variant="destructive">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {failed} gagal
          </Badge>
        )}
      </div>
      <div className="max-h-96 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden w-12 sm:table-cell">#</TableHead>
              <TableHead>Hasil</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outcomes.map((o) => (
              <TableRow
                key={o.rowIndex}
                className={o.status === "error" ? "bg-destructive/5" : ""}
              >
                <TableCell className="hidden text-muted-foreground text-xs sm:table-cell">
                  {o.rowIndex}
                </TableCell>
                <TableCell className="text-xs whitespace-normal">
                  {o.status === "success" ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {o.message}
                    </span>
                  ) : (
                    <span className="text-destructive">{o.message}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: perbaiki baris yang gagal di spreadsheet lalu impor ulang.
      </p>
    </div>
  )
}

function Footer({
  phase,
  onClose,
  onApply,
}: {
  phase: Phase
  onClose: () => void
  onApply: () => void
}) {
  if (phase.kind === "loading" || phase.kind === "error") {
    return (
      <Button variant="outline" onClick={onClose}>
        Batal
      </Button>
    )
  }
  if (phase.kind === "preview") {
    const blockedRows = phase.rows.filter((r) => r.errors.length > 0).length
    const runnable = phase.rows.length - blockedRows
    return (
      <>
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button onClick={onApply} disabled={runnable === 0}>
          <FileUp className="mr-2 h-4 w-4" />
          Impor{runnable === 0 ? " (tidak ada baris valid)" : ` (${runnable})`}
        </Button>
      </>
    )
  }
  if (phase.kind === "applying") {
    return (
      <Button variant="outline" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Memproses…
      </Button>
    )
  }
  return <Button onClick={onClose}>Selesai</Button>
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>
        <p className="font-medium">Tidak bisa membaca file</p>
        <p className="mt-1 text-xs opacity-80">{message}</p>
      </div>
    </div>
  )
}
