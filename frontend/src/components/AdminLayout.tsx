import { useState } from "react"
import { Outlet, useLocation } from "react-router"
import AdminSidebar from "./AdminSidebar"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Menu, BookOpen } from "lucide-react"

export default function AdminLayout() {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile drawer after navigating, otherwise it stays over the
  // page the user just picked.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setMenuOpen(false)
  }

  return (
    <div className="flex min-h-svh overflow-x-hidden">
      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-svh md:flex">
        <AdminSidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        {/* The drawer sits outside the sticky header: a fixed element inside
            a backdrop-filter/transform ancestor would be clipped to it. */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="p-0 w-64">
            <AdminSidebar mobile />
          </SheetContent>
        </Sheet>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card px-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Buka menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 font-bold">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="text-sm">
              Masjid<span className="text-primary">Hub</span>
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
