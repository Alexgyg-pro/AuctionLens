import { useEffect, useState } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import { api, ApiError } from '../../api.js'
import { formatDate, formatEstimate } from './format.js'
import { PublicLoading, PublicNotFound } from './PublicStates.jsx'
import LotView from './LotView.jsx'

// Espace acheteur : anonyme, lecture seule, pensé pour le smartphone en salle.
export default function SaleView() {
  return (
    <Routes>
      <Route index element={<SaleLots />} />
      <Route path="lots/:lotId" element={<LotView />} />
      <Route path="*" element={<PublicNotFound />} />
    </Routes>
  )
}

function SaleLots() {
  const { saleSlug } = useParams()
  const [sale, setSale] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    api(`/api/public/sales/${encodeURIComponent(saleSlug)}`)
      .then((data) => {
        setSale(data)
        setState('ok')
      })
      .catch((err) => {
        setState(err instanceof ApiError && err.status === 404 ? 'notfound' : 'error')
      })
  }, [saleSlug])

  if (state === 'loading') return <PublicLoading />
  if (state === 'notfound') return <PublicNotFound />
  if (state === 'error')
    return (
      <main className="public-page">
        <p className="error">Impossible de charger la vente. Vérifiez votre connexion et réessayez.</p>
      </main>
    )

  const date = formatDate(sale.event_date)

  return (
    <main className="public-page">
      <header className="public-header">
        <p className="public-cabinet">{sale.cabinet_name}</p>
        <h1>{sale.title}</h1>
        <p className="public-muted">
          {[date, sale.location].filter(Boolean).join(' — ')}
        </p>
        {sale.description && <p className="public-description">{sale.description}</p>}
      </header>

      <ul className="lot-list">
        {sale.lots.map((lot) => {
          const estimate = formatEstimate(lot.estimate_low, lot.estimate_high)
          return (
            <li key={lot.id}>
              <Link to={`lots/${lot.id}`} className="lot-card">
                <span className="lot-number">N° {lot.lot_number}</span>
                <span className="lot-title">{lot.title}</span>
                {lot.artist && <span className="lot-artist">{lot.artist}</span>}
                <span className="lot-meta">
                  {estimate && <span>{estimate}</span>}
                  {lot.resource_count > 0 && (
                    <span className="lot-resources">
                      {lot.resource_count} contenu{lot.resource_count > 1 ? 's' : ''} enrichi
                      {lot.resource_count > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      {sale.lots.length === 0 && (
        <p className="public-muted">Le catalogue de cette vente n'est pas encore disponible.</p>
      )}
    </main>
  )
}
