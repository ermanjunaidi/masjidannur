import { BrowserRouter, Routes, Route } from "react-router"
import { AuthProvider } from "@/context/AuthContext"
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
import SecurityPage from "@/pages/SecurityPage"
import BooksPage from "@/pages/BooksPage"
import CategoriesPage from "@/pages/CategoriesPage"
import TransactionsPage from "@/pages/TransactionsPage"
import ReportsPage from "@/pages/ReportsPage"
import LecturingsPage from "@/pages/LecturingsPage"
import PublicDisplayPage from "@/pages/PublicDisplayPage"

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/display" element={<PublicDisplayPage />} />
          <Route path="/display/:slug" element={<PublicDisplayPage />} />
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
            <Route index element={<AdminDashboard />} />
            <Route path="books" element={<BooksPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="lecturings" element={<LecturingsPage />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
