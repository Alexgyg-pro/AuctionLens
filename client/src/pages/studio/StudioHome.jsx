import UserBar from '../../components/UserBar.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'

export default function StudioHome() {
  const { session } = useAuth()

  return (
    <main className="page">
      <UserBar />
      <h1>Studio</h1>
      <p>Bienvenue, {session.cabinet?.name ?? session.user.email}.</p>
      <p>Gestion des ventes, lots et ressources — à venir (EPIC 4).</p>
    </main>
  )
}
