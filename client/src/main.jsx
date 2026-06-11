import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Home from './pages/Home.jsx'
import AdminHome from './pages/admin/AdminHome.jsx'
import StudioHome from './pages/studio/StudioHome.jsx'
import SaleView from './pages/public/SaleView.jsx'
import NotFound from './pages/NotFound.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/*" element={<AdminHome />} />
        <Route path="/studio/*" element={<StudioHome />} />
        <Route path="/v/:saleSlug/*" element={<SaleView />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
