import { Link, useLocation } from "react-router"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Wrench,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Shield,
  Car,
  ClipboardList,
  Package,
  Receipt,
  CalendarCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

interface NavItem {
  icon: typeof LayoutDashboard
  label: string
  href: string
  permission?: string
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
  { icon: Car, label: "Pelanggan & Kendaraan", href: "/admin/customers", permission: "customers:read" },
  { icon: ClipboardList, label: "Work Order", href: "/admin/work-orders", permission: "workorders:read" },
  { icon: Package, label: "Sparepart & Stok", href: "/admin/spareparts", permission: "spareparts:read" },
  { icon: Receipt, label: "Invoice", href: "/admin/invoices", permission: "invoices:read" },
  { icon: CalendarCheck, label: "Absensi", href: "/admin/attendance", permission: "attendance:read" },
  // Access-control surface: visible to anyone with at least user listing
  // rights (admins + delegated managers alike).
  { icon: Users, label: "Users & Roles", href: "/admin/users", permission: "users:read" },
  { icon: BarChart3, label: "Analytics", href: "/admin/analytics", permission: "analytics:read" },
  { icon: Shield, label: "Security", href: "/admin/security" },
  { icon: Settings, label: "Settings", href: "/admin/settings", permission: "settings:read" },
]

export default function AdminSidebar() {
  const { pathname } = useLocation()
  const { logout, user, hasPermission } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = () => {
    logout()
    // Full page navigation: bypasses React Router entirely so the
    // ProtectedRoute /admin can never redirect to /login mid-transition.
    // On load the token is already gone, so the landing page renders.
    window.location.href = "/"
  }

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4">
<Link
            to="/"
            className={cn(
              "flex items-center gap-2 font-bold",
              collapsed ? "justify-center" : ""
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Wrench className="h-3.5 w-3.5" />
            </span>
            {!collapsed && <span className="text-lg">TAMZ<span className="text-primary">Garage</span></span>}
          </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          if (item.permission && !hasPermission(item.permission)) {
            return null
          }
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t p-3 space-y-2">
        {/* User info */}
        {!collapsed && user && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {!user.roles || user.roles.length === 0
                ? "no role"
                : user.roles.map((r) => r.name).join(", ")}
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              {(user.roles ?? []).reduce((sum, r) => sum + (r.permissions?.length ?? 0), 0)} permissions
            </p>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>

        {/* Logout */}
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-muted-foreground hover:text-destructive",
            collapsed && "justify-center"
          )}
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-3">Logout</span>}
        </Button>
      </div>
    </aside>
  )
}
