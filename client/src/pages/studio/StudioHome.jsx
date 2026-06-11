import UserBar from '../../components/UserBar.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'

export default function StudioHome() {
  const { session } = useAuth()

  if (session.cabinet?.subscription_status === 'suspended') {
    return (
      <main className="page">
        <UserBar />
        <h1>Studio</h1>
        <p className="notice">
          L'abonnement de {session.cabinet.name} est suspendu. Vos ventes ne sont plus
          visibles des acheteurs et le studio est en lecture bloquée. Contactez
          AuctionLens pour le réactiver.
        </p>
      </main>
    )
  }

  return (
    <main className="page">
      <UserBar />
      <h1>Studio</h1>
      <p>Bienvenue, {session.cabinet?.name ?? session.user.email}.</p>
      <p>Gestion des ventes, lots et ressources — à venir (EPIC 4).</p>
    </main>
  )
}
