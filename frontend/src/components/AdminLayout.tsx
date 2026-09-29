import { Outlet } from "react-router"
import AdminSidebar from "./AdminSidebar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Menu, Wrench } from "lucide-react"

export default function AdminLayout() {
  return (
    <div className="flex min-h-svh overflow-x-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <AdminSidebar />
      </div>

      {/* Mobile sidebar */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed left-3 top-3 z-40"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <AdminSidebar />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex h-16 items-center justify-center border-b bg-card">
          <div className="flex items-center gap-2 font-bold">
            <Wrench className="h-5 w-5 text-primary" />
            <span className="text-sm">TAMZ<span className="text-primary">Garage</span></span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
