import { Navigate } from "react-router"
import { useAuth } from "@/context/AuthContext"

interface ProtectedRouteProps {
  children: React.ReactNode
  /**
   * Optional permission gate. When set, the user MUST hold this
   * permission to render. Falls through to the auth check when omitted.
   */
  requiredPermission?: string
}

export default function ProtectedRoute({
  children,
  requiredPermission,
}: ProtectedRouteProps) {
  const { isAuthenticated, hydrating, hasPermission } = useAuth()

  // WAIT for the /me probe to complete so we don't momentarily render
  // an authenticated UI on top of an expired token (causes a flash of
  // the dashboard followed by a hard redirect to /login).
  if (hydrating) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center p-8 text-center">
        <h1 className="text-2xl font-bold">Forbidden</h1>
        <p className="mt-2 text-muted-foreground">
          You don't have the <code className="rounded bg-muted px-1">{requiredPermission}</code> permission.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
