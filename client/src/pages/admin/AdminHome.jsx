import { Routes, Route } from 'react-router-dom'
import UserBar from '../../components/UserBar.jsx'
import CabinetList from './CabinetList.jsx'
import CabinetDetail from './CabinetDetail.jsx'

export default function AdminHome() {
  return (
    <main className="page page-wide">
      <UserBar />
      <Routes>
        <Route index element={<CabinetList />} />
        <Route path="cabinets/:id" element={<CabinetDetail />} />
      </Routes>
    </main>
  )
}
