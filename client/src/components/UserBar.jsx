import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function UserBar() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  if (!session) return null

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="userbar">
      <span>{session.user.email}</span>
      {session.cabinet && <span> — {session.cabinet.name} ({session.cabinet.plan_name})</span>}
      <button type="button" onClick={handleLogout}>
        Se déconnecter
      </button>
    </div>
  )
}
