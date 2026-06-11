import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './auth/AuthContext.jsx'
import RequireRole from './auth/RequireRole.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import AdminHome from './pages/admin/AdminHome.jsx'
import StudioHome from './pages/studio/StudioHome.jsx'
import SaleView from './pages/public/SaleView.jsx'
import NotFound from './pages/NotFound.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin/*"
            element={
              <RequireRole role="admin">
                <AdminHome />
              </RequireRole>
            }
          />
          <Route
            path="/studio/*"
            element={
              <RequireRole role="cabinet">
                <StudioHome />
              </RequireRole>
            }
          />
          <Route path="/v/:saleSlug/*" element={<SaleView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
