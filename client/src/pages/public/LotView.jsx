import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../../api.js'
import { formatEstimate } from './format.js'
import { PublicLoading, PublicNotFound } from './PublicStates.jsx'

// Fiche enrichie d'un lot : la notice du catalogue puis les ressources
// dans l'ordre choisi par le cabinet.
export default function LotView() {
  const { saleSlug, lotId } = useParams()
  const [lot, setLot] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    api(`/api/public/lots/${encodeURIComponent(lotId)}`)
      .then((data) => {
        setLot(data)
        setState('ok')
      })
      .catch((err) => {
        setState(err instanceof ApiError && err.status === 404 ? 'notfound' : 'error')
      })
  }, [lotId])

  if (state === 'loading') return <PublicLoading />
  if (state === 'notfound') return <PublicNotFound />
  if (state === 'error')
    return (
      <main className="public-page">
        <p className="error">Impossible de charger ce lot. Vérifiez votre connexion et réessayez.</p>
      </main>
    )

  const estimate = formatEstimate(lot.estimate_low, lot.estimate_high)

  return (
    <main className="public-page">
      <nav className="public-back">
        <Link to={`/v/${saleSlug}`}>← Tous les lots</Link>
      </nav>

      <header className="public-header">
        <p className="public-cabinet">{lot.sale_title}</p>
        <h1>
          <span className="lot-number">N° {lot.lot_number}</span> {lot.title}
        </h1>
        {lot.artist && <p className="lot-artist">{lot.artist}</p>}
        {estimate && <p className="lot-estimate">Estimation : {estimate}</p>}
        {lot.description && <p className="public-description">{lot.description}</p>}
      </header>

      <div className="resource-list">
        {lot.resources.map((r) => (
          <ResourceBlock key={r.id} resource={r} />
        ))}
      </div>

      {lot.resources.length === 0 && (
        <p className="public-muted">Aucun contenu enrichi pour ce lot.</p>
      )}
    </main>
  )
}

function ResourceBlock({ resource }) {
  const { type, title, body, file_path } = resource
  const fileUrl = file_path ? `/uploads/${file_path}` : null

  switch (type) {
    case 'image_hd':
      return (
        <figure className="resource resource-image">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <img src={fileUrl} alt={title} loading="lazy" />
          </a>
          <figcaption>{title}</figcaption>
        </figure>
      )
    case 'video':
      return (
        <section className="resource">
          <h2>{title}</h2>
          <video controls preload="metadata" src={fileUrl} />
        </section>
      )
    case 'pdf':
      return (
        <section className="resource">
          <a className="resource-file" href={fileUrl} target="_blank" rel="noopener noreferrer">
            📄 {title} (PDF)
          </a>
        </section>
      )
    case 'text':
      return (
        <section className="resource resource-text">
          <h2>{title}</h2>
          {String(body ?? '')
            .split(/\n+/)
            .filter(Boolean)
            .map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
        </section>
      )
    case 'link':
      return (
        <section className="resource">
          <a className="resource-file" href={body} target="_blank" rel="noopener noreferrer">
            🔗 {title}
          </a>
        </section>
      )
    default:
      return null
  }
}
