"use client"

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface PaginationProps {
  /** Total number of items across all pages */
  total: number
  /** Current 1-based page index */
  page: number
  /** Items per page */
  pageSize: number
  /** Called when either the page or page size changes */
  onChange: (page: number, pageSize: number) => void
  /** Available page sizes shown in the selector; defaults to [10, 25, 50, 100] */
  pageSizeOptions?: number[]
  /** Show a spinner next to the "Showing X–Y" label while data loads */
  loading?: boolean
  /** Trailing noun in "Showing X–Y of N <itemLabel>"; defaults to "items" */
  itemLabel?: string
  className?: string
}

export function Pagination({
  total,
  page,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onChange,
  loading,
  itemLabel = "items",
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  // Clamp the requested page defensively so the UI never shows
  // "Page 4 of 3" if onChange fires with a now-stale page after a
  // deletion reduced the dataset.
  const safePage = Math.min(Math.max(1, page), totalPages)
  const hasItems = total > 0
  const start = hasItems ? (safePage - 1) * pageSize + 1 : 0
  const end = Math.min(total, safePage * pageSize)

  const goTo = (next: number) =>
    onChange(Math.min(Math.max(1, next), totalPages), pageSize)

  const setSize = (next: number) => {
    // When changing page size, keep the user on the row they were
    // looking at by jumping to the page that contains `start`.
    const anchor = start || 1
    const nextPage = Math.max(1, Math.ceil(anchor / next))
    onChange(nextPage, next)
  }

  const atFirst = safePage <= 1
  const atLast = safePage >= totalPages

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span>
          {hasItems ? (
            <>
              Showing{" "}
              <span className="font-medium text-foreground tabular-nums">
                {start}
              </span>
              –
              <span className="font-medium text-foreground tabular-nums">
                {end}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground tabular-nums">
                {total}
              </span>{" "}
              {itemLabel}
            </>
          ) : (
            <>No {itemLabel}</>
          )}
        </span>
        {loading && (
          <Loader2
            className="h-3 w-3 animate-spin"
            aria-label="Loading"
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => goTo(1)}
            disabled={!hasItems || atFirst}
            title="First page"
            aria-label="First page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => goTo(safePage - 1)}
            disabled={!hasItems || atFirst}
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-2 tabular-nums">
            Page{" "}
            <span className="font-medium text-foreground">{safePage}</span> of{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => goTo(safePage + 1)}
            disabled={!hasItems || atLast}
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => goTo(totalPages)}
            disabled={!hasItems || atLast}
            title="Last page"
            aria-label="Last page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <label className="inline-flex items-center gap-1.5">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
            disabled={!hasItems}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
