import { BrowserRouter, Navigate, Routes, Route } from "react-router"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import { navItems } from "@/lib/nav"
import ProtectedRoute from "@/components/ProtectedRoute"
import AdminLayout from "@/components/AdminLayout"
import LandingPage from "@/pages/LandingPage"
import LoginPage from "@/pages/LoginPage"
import RegisterPage from "@/pages/RegisterPage"
import ForgotPasswordPage from "@/pages/ForgotPasswordPage"
import ResetPasswordPage from "@/pages/ResetPasswordPage"
import AdminDashboard from "@/pages/AdminDashboard"
import AdminUsers from "@/pages/AdminUsers"
import SettingsPage from "@/pages/SettingsPage"
import BackupPage from "@/pages/BackupPage"
import SecurityPage from "@/pages/SecurityPage"
import BooksPage from "@/pages/BooksPage"
import CategoriesPage from "@/pages/CategoriesPage"
import TransactionsPage from "@/pages/TransactionsPage"
import ReportsPage from "@/pages/ReportsPage"
import DistributionsPage from "@/pages/DistributionsPage"
import AuditPage from "@/pages/AuditPage"
import LecturingsPage from "@/pages/LecturingsPage"
import PublicDisplayPage from "@/pages/PublicDisplayPage"

// Halaman awal /admin: Dashboard bila role mengizinkan, kalau tidak
// langsung ke menu pertama yang boleh dibuka.
function AdminIndex() {
  const { hasPermission } = useAuth()
  if (hasPermission("dashboard:read")) return <AdminDashboard />
  const first = navItems.find(
    (item) => item.href.startsWith("/admin/") && item.permission && hasPermission(item.permission),
  )
  if (first) return <Navigate to={first.href} replace />
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      Role Anda belum diberi akses ke menu mana pun. Hubungi admin masjid.
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          {/* Layar TV hanya untuk yang sudah login (butuh settings
              masjid milik akun) */}
          <Route
            path="/display"
            element={
              <ProtectedRoute requiredPermission="display:read">
                <PublicDisplayPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/display/:slug"
            element={
              <ProtectedRoute requiredPermission="display:read">
                <PublicDisplayPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Admin routes (protected) */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminIndex />} />
            <Route path="books" element={<BooksPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="distributions" element={<DistributionsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="lecturings" element={<LecturingsPage />} />
            <Route path="users" element={<AdminUsers />} />
            <Route
              path="audit"
              element={
                <ProtectedRoute requiredPermission="audit:read">
                  <AuditPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="security"
              element={
                <ProtectedRoute requiredPermission="security:read">
                  <SecurityPage />
                </ProtectedRoute>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="backup" element={<BackupPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
