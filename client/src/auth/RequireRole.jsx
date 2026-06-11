import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

export default function RequireRole({ role, children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <main className="page">
        <p>Chargement…</p>
      </main>
    )
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (session.user.role !== role) {
    return (
      <main className="page">
        <h1>Accès refusé</h1>
        <p>Cette page est réservée au rôle « {role} ».</p>
      </main>
    )
  }
  return children
}
