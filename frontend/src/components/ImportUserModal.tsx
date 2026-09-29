// Two-step user import dialog.
//
//   Step "preview"   → fetch users/roles catalogue + parse file in
//                     parallel, list every row with action / errors
//                     and admin can either back out or hit "Apply import".
//   Step "summary"   → outcomes table after the API apply loop has run,
//                     with success/error breakdown so the admin can fix
//                     bad rows in their spreadsheet and re-import.
//
// The fetch + file parse are folded into ONE effect so the preview
// only appears once both are ready. This avoids a TOCTOU bug where
// Apply could fire while the catalogue fetch was still in flight,
// causing every row to be mis-classified as "create" and resulting
// in a flood of "email already registered" 409s.
//
// Imports follow the existing ModalShell pattern instead of depending
// on a shadcn Dialog component that isn't installed.

import { useEffect, useRef, useState } from "react"
import { Download, FileUp, Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

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

import {
  type ImportRowOutcome,
  type ParsedUserRow,
  applyImportRows,
  downloadUsersTemplate,
  exportUsersToXlsx,
  parseImportRows,
  readUsersXlsxFile,
} from "@/lib/userExcel"
import type { User } from "@/lib/types"

interface ImportUserModalProps {
  open: boolean
  file: File | null
  onClose: () => void
  // Called after a successful import so the host can refresh its list.
  onComplete?: () => void
}

type Phase =
  | { kind: "loading"; what: "data" | "file" }
  | { kind: "preview"; rows: ParsedUserRow[] }
  | { kind: "applying"; rows: ParsedUserRow[] }
  | { kind: "summary"; outcomes: ImportRowOutcome[] }
  | { kind: "error"; message: string }

export function ImportUserModal({
  open,
  file,
  onClose,
  onComplete,
}: ImportUserModalProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading", what: "data" })
  // Guard against double-clicks on Apply during the brief window before
  // React renders the disabled "Working…" state.
  const applyingRef = useRef(false)

  // Fetch catalogue + parse file in parallel. The preview phase only
  // becomes reachable after BOTH promises resolve, so the rows are
  // always classified against a fully-loaded user list and role table.
  useEffect(() => {
    if (!open || !file) return
    let cancelled = false
    setPhase({ kind: "loading", what: "data" })

    void (async () => {
      try {
        // Lazy-import api so this modal's chunk doesn't pull the
        // whole network layer just to render a static empty state.
        const { usersApi, rolesApi } = await import("@/lib/api")
        const [u, r] = await Promise.all([
          usersApi.list(),
          rolesApi.list(),
        ])
        if (cancelled) return
        const existingUsers = u.users ?? []
        const availableRoles = r.roles ?? []

        setPhase({ kind: "loading", what: "file" })
        const raw = await readUsersXlsxFile(file)
        if (cancelled) return
        const rows = parseImportRows(raw, existingUsers, availableRoles)
        if (cancelled) return
        setPhase({ kind: "preview", rows })
      } catch (e) {
        if (cancelled) return
        setPhase({
          kind: "error",
          message:
            e instanceof Error ? e.message : "Failed to read xlsx file",
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, file])

  const handleApply = async () => {
    if (phase.kind !== "preview") return
    if (applyingRef.current) return
    applyingRef.current = true
    try {
      const rows = phase.rows
      setPhase({ kind: "applying", rows })
      const outcomes = await applyImportRows(rows)
      setPhase({ kind: "summary", outcomes })
      // Pending User modal who hasn't refreshed yet: tell it to.
      if (outcomes.some((o) => o.status === "success")) {
        onComplete?.()
      }
    } finally {
      applyingRef.current = false
    }
  }

  const handleClose = () => {
    onClose()
  }

  const title = (() => {
    switch (phase.kind) {
      case "loading":
        return phase.what === "data" ? "Loading data…" : "Reading file…"
      case "preview":
        return `Review ${phase.rows.length} rows`
      case "applying":
        return "Applying import…"
      case "summary":
        return "Import complete"
      case "error":
        return "Import failed"
    }
  })()

  const descriptionNode = file && (
    <span>
      Importing from <code className="font-mono">{file.name}</code>
    </span>
  )

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      title={title}
      description={descriptionNode}
      size="lg"
      footer={
        <Footer
          phase={phase}
          onClose={handleClose}
          onApply={() => void handleApply()}
        />
      }
    >
      {phase.kind === "loading" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {phase.what === "data"
            ? "Loading user & role catalogue…"
            : `Parsing ${file?.name}…`}
        </div>
      )}

      {phase.kind === "error" && <ErrorBlock message={phase.message} />}

      {phase.kind === "preview" && <PreviewTable rows={phase.rows} />}
      {phase.kind === "applying" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing {phase.rows.length} rows… please don't close this window.
        </div>
      )}
      {phase.kind === "summary" && <SummaryBlock outcomes={phase.outcomes} />}
    </ModalShell>
  )
}

// ─── Preview table ───────────────────────────────────────────────────────────

function PreviewTable({ rows }: { rows: ParsedUserRow[] }) {
  const errorRows = rows.filter((r) => r.errors.length > 0).length
  const updateRows = rows.filter((r) => r.action === "update").length
  const createRows = rows.length - updateRows - errorRows
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          {createRows} new
        </Badge>
        <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
          {updateRows} updates
        </Badge>
        {errorRows > 0 && (
          <Badge variant="destructive" className="text-xs">
            {errorRows} blocked
          </Badge>
        )}
      </div>
      // Mobile: # dan Name disembunyikan (hidden sm:table-cell) agar 3
      // kolom penting (Action/Email/Status) muat; pesan error boleh wrap
      // supaya tabel tidak melebar melebihi layar HP.
      <div className="max-h-96 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden w-12 sm:table-cell">#</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="hidden sm:table-cell">Name</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No data rows found in the file.
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
                    <TableCell>
                      {hasError ? (
                        <Badge variant="destructive" className="text-[10px]">
                          <XCircle className="mr-1 h-3 w-3" />
                          blocked
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-[10px] capitalize"
                        >
                          {r.action}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.raw.email || <span className="text-muted-foreground italic">(missing)</span>}
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {r.raw.name || <span className="text-muted-foreground italic">(missing)</span>}
                    </TableCell>
                    <TableCell className="space-y-1 text-xs whitespace-normal">
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

// ─── Summary block ───────────────────────────────────────────────────────────

function SummaryBlock({ outcomes }: { outcomes: ImportRowOutcome[] }) {
  const success = outcomes.filter((o) => o.status === "success").length
  const failed = outcomes.filter((o) => o.status === "error").length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {success} succeeded
        </Badge>
        {failed > 0 && (
          <Badge variant="destructive">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {failed} failed
          </Badge>
        )}
      </div>
      <div className="max-h-96 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden w-12 sm:table-cell">#</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outcomes.map((o) => (
              <TableRow key={o.rowIndex} className={o.status === "error" ? "bg-destructive/5" : ""}>
                <TableCell className="hidden text-muted-foreground text-xs sm:table-cell">
                  {o.rowIndex}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {o.email || <span className="italic text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="capitalize text-xs">{o.action}</TableCell>
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
        Tip: fix failed rows in your spreadsheet and re-import. Succeeded rows are
        idempotent on email — running the import twice will not create duplicates.
      </p>
    </div>
  )
}

// ─── Footer controls ─────────────────────────────────────────────────────────

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
        Cancel
      </Button>
    )
  }
  if (phase.kind === "preview") {
    const blockedRows = phase.rows.filter((r) => r.errors.length > 0).length
    const runnable = phase.rows.length - blockedRows
    const disabled = runnable === 0
    return (
      <>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onApply} disabled={disabled}>
          <FileUp className="mr-2 h-4 w-4" />
          Apply import{disabled ? " (no runnable rows)" : ` (${runnable})`}
        </Button>
      </>
    )
  }
  if (phase.kind === "applying") {
    return (
      <Button variant="outline" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Working…
      </Button>
    )
  }
  // summary
  return <Button onClick={onClose}>Done</Button>
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>
        <p className="font-medium">Couldn't read the file</p>
        <p className="mt-1 text-xs opacity-80">{message}</p>
      </div>
    </div>
  )
}

// ─── Toolbar composable ──────────────────────────────────────────────────────
// UserExportImportButtons hoists the file-picker + export/template
// trigger pieces out of UsersTable so the table itself stays focused
// on row-level CRUD.

interface UserExportImportButtonsProps {
  users: User[]
  disabled?: boolean
  // Called after a successful import so the host can rerun its
  // user list fetch. Without this, the table would still show the
  // pre-import snapshot after the modal closes.
  onImported?: () => void
}

export function UserExportImportButtons({
  users,
  disabled,
  onImported,
}: UserExportImportButtonsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<"export" | "template" | null>(null)

  const handleExport = async () => {
    setBusy("export")
    try {
      await exportUsersToXlsx(users)
    } finally {
      setBusy(null)
    }
  }
  const handleTemplate = async () => {
    setBusy("template")
    try {
      await downloadUsersTemplate()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={() => void handleTemplate()}
        disabled={busy !== null}
        className="gap-2"
        title="Download a blank xlsx with example rows so you know the column shape"
      >
        {busy === "template" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Template
      </Button>
      <Button
        variant="outline"
        onClick={() => void handleExport()}
        disabled={busy !== null || disabled || users.length === 0}
        className="gap-2"
      >
        {busy === "export" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Export xlsx
      </Button>
      <Button onClick={() => fileRef.current?.click()} className="gap-2">
        <FileUp className="h-4 w-4" />
        Import xlsx
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label="Choose .xlsx file to import"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset the input's value so picking the SAME file again still
          // fires `change` — browsers otherwise cache based on file identity.
          e.target.value = ""
          if (file) setPendingFile(file)
        }}
      />
      <ImportUserModal
        open={pendingFile !== null}
        file={pendingFile}
        onClose={() => setPendingFile(null)}
        onComplete={() => {
          // Reset local state so re-imports work cleanly, then notify
          // the host so it can re-fetch the user list. Either action
          // alone is half a fix; together they keep the table in sync.
          setPendingFile(null)
          onImported?.()
        }}
      />
    </div>
  )
}
