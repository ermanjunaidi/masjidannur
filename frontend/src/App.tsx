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
import CustomersPage from "@/pages/CustomersPage"
import WorkOrdersPage from "@/pages/WorkOrdersPage"
import WorkOrderDetailPage from "@/pages/WorkOrderDetailPage"
import SparepartsPage from "@/pages/SparepartsPage"
import InvoicesPage from "@/pages/InvoicesPage"
import AttendancePage from "@/pages/AttendancePage"

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
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
            <Route path="customers" element={<CustomersPage />} />
            <Route path="work-orders" element={<WorkOrdersPage />} />
            <Route path="work-orders/:id" element={<WorkOrderDetailPage />} />
            <Route path="spareparts" element={<SparepartsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="analytics" element={<AdminDashboard />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
