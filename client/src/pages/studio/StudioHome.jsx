import { Routes, Route } from 'react-router-dom'
import UserBar from '../../components/UserBar.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import SalesList from './SalesList.jsx'
import SaleDetail from './SaleDetail.jsx'

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
    <main className="page page-wide">
      <UserBar />
      <Routes>
        <Route index element={<SalesList />} />
        <Route path="sales/:id" element={<SaleDetail />} />
      </Routes>
    </main>
  )
}
