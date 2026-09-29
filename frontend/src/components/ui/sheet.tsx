"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SheetContextType {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextType | null>(null)

function useSheet() {
  const context = React.useContext(SheetContext)
  if (!context) {
    throw new Error("useSheet must be used within a Sheet")
  }
  return context
}

function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen

  return (
    <SheetContext.Provider value={{ open: isOpen, onOpenChange: setIsOpen }}>
      {children}
    </SheetContext.Provider>
  )
}

function SheetTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { onOpenChange } = useSheet()

  if (asChild) {
    const child = children as React.ReactElement<{ onClick?: React.MouseEventHandler }>

    return React.cloneElement(child, {
      onClick: (event) => {
        child.props.onClick?.(event)
        onOpenChange(true)
      },
    })
  }

  return (
    <button onClick={() => onOpenChange(true)} {...props}>
      {children}
    </button>
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<"div"> & { side?: "top" | "bottom" | "left" | "right" }) {
  const { open, onOpenChange } = useSheet()

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  if (!open) return null

  const sideStyles = {
    top: "top-0 left-0 right-0 animate-in slide-in-from-top duration-200",
    bottom: "bottom-0 left-0 right-0 animate-in slide-in-from-bottom duration-200",
    left: "left-0 top-0 bottom-0 animate-in slide-in-from-left duration-200",
    right: "right-0 top-0 bottom-0 animate-in slide-in-from-right duration-200",
  }

  const sizeStyles = {
    top: "max-h-[80vh]",
    bottom: "max-h-[80vh]",
    left: "h-full w-72 max-w-[80vw] pb-[env(safe-area-inset-bottom)]",
    right: "h-full w-72 max-w-[80vw] pb-[env(safe-area-inset-bottom)]",
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        data-slot="sheet-content"
        className={cn(
          // overflow-y-auto: sidebar dengan menu panjang bisa di-scroll di
          // layar pendek (sebelumnya item bawah tak terjangkau). Animasi
          // slide-in lewat sideStyles (tw-animate-css) — class
          // transition-transform lama tidak pernah ber efek karena tidak
          // ada transform awal/akhir yang berubah.
          "fixed z-50 flex flex-col gap-4 overflow-y-auto overscroll-contain bg-background p-6 shadow-lg",
          sideStyles[side],
          sizeStyles[side],
          className
        )}
        {...props}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  )
}

function SheetHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-2 text-center sm:text-left",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
}
