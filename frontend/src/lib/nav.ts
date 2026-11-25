// Menu sidebar admin beserta izin (permission) yang membukanya. Dipakai
// sidebar dan halaman awal /admin.

import {
  LayoutDashboard,
  Users,
  Settings,
  BookOpen,
  Tags,
  Receipt,
  FileBarChart,
  CalendarDays,
  Moon,
  Tv,
  DatabaseBackup,
  HandHeart,
  ScrollText,
} from "lucide-react"

export interface NavItem {
  icon: typeof LayoutDashboard
  label: string
  href: string
  permission?: string
  /** Only the platform superadmin (organization 0). */
  platformOnly?: boolean
}

// Setiap menu punya izin sendiri yang bisa diatur di Edit Role. Pengecualian:
// Backup & Restore hanya untuk superadmin platform (menyangkut semua masjid).
export const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin", permission: "dashboard:read" },
  { icon: BookOpen, label: "Buku Kas", href: "/admin/books", permission: "books:read" },
  { icon: Tags, label: "Kategori", href: "/admin/categories", permission: "categories:read" },
  { icon: Receipt, label: "Transaksi", href: "/admin/transactions", permission: "transactions:read" },
  { icon: HandHeart, label: "Pembagian Warga", href: "/admin/distributions", permission: "distributions:read" },
  { icon: FileBarChart, label: "Laporan", href: "/admin/reports", permission: "reports:read" },
  { icon: CalendarDays, label: "Jadwal Pengajian", href: "/admin/lecturings", permission: "lecturings:read" },
  { icon: Tv, label: "Layar TV (Display)", href: "/display", permission: "display:read" },
  // Access-control surface: visible to anyone with at least user listing
  // rights (admins + delegated managers alike).
  { icon: Users, label: "Users & Roles", href: "/admin/users", permission: "users:read" },
  { icon: ScrollText, label: "Audit Log", href: "/admin/audit", permission: "audit:read" },
  { icon: Moon, label: "Security", href: "/admin/security", permission: "security:read" },
  { icon: Settings, label: "Settings", href: "/admin/settings", permission: "settings:read" },
  { icon: DatabaseBackup, label: "Backup & Restore", href: "/admin/backup", platformOnly: true },
]
