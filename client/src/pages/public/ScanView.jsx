import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../api.js'
import { PublicLoading, PublicNotFound } from './PublicStates.jsx'
// Brique eVision intégrée telle quelle (voir evision/README.md) — ce module
// n'est chargé que sur la route de scan (lazy), TF.js reste hors du bundle principal.
import ImageRecognizer from '../../components/ImageRecognizer'

export default function ScanView() {
  const { saleSlug } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Mode test du cabinet : ?debug=1 affiche les scores en direct pour calibrer le seuil.
  const debug = searchParams.get('debug') === '1'

  const [manifest, setManifest] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    api(`/api/public/sales/${encodeURIComponent(saleSlug)}/recognition-manifest`)
      .then((data) => {
        setManifest(data)
        setState('ok')
      })
      .catch((err) => {
        setState(err instanceof ApiError && err.status === 404 ? 'notfound' : 'error')
      })
  }, [saleSlug])

  // Référence stable : le composant recalcule tous les embeddings si ce tableau change.
  const references = useMemo(
    () => (manifest?.references ?? []).map((r) => ({ id: r.id, src: r.src })),
    [manifest]
  )
  const lotByRefId = useMemo(
    () => new Map((manifest?.references ?? []).map((r) => [r.id, r.lotId])),
    [manifest]
  )

  // La caméra exige un contexte sécurisé (HTTPS ou localhost) : on l'explique
  // au lieu d'échouer silencieusement.
  if (!window.isSecureContext) {
    return (
      <main className="public-page">
        <BackToSale slug={saleSlug} />
        <h1>Scanner le catalogue</h1>
        <p className="notice">
          Le scan nécessite une connexion sécurisée (HTTPS) pour accéder à la
          caméra. Cette page est servie en HTTP : la caméra n'est pas
          disponible. Vous pouvez consulter le catalogue par la liste des lots.
        </p>
        <p>
          <Link to={`/v/${saleSlug}`}>Consulter la liste des lots</Link>
        </p>
      </main>
    )
  }

  if (state === 'loading') return <PublicLoading />
  if (state === 'notfound') return <PublicNotFound />
  if (state === 'error')
    return (
      <main className="public-page">
        <BackToSale slug={saleSlug} />
        <p className="error">Impossible de préparer le scan. Vérifiez votre connexion et réessayez.</p>
      </main>
    )

  function handleRecognized({ id }) {
    const lotId = lotByRefId.get(id)
    if (lotId) navigate(`/v/${saleSlug}/lots/${lotId}`)
  }

  return (
    <main className="public-page scan-page">
      <BackToSale slug={saleSlug} />
      <h1>Scanner le catalogue</h1>
      <p className="public-muted">
        Cadrez une image du catalogue marquée de l'icône ✦ dans le viseur : la
        fiche du lot s'ouvrira automatiquement.
      </p>

      <ImageRecognizer
        references={references}
        onImageRecognized={handleRecognized}
        threshold={manifest.threshold}
        debugOverlay={debug}
      />

      <p className="public-muted scan-fallback">
        Pas de caméra, ou permission refusée ?{' '}
        <Link to={`/v/${saleSlug}`}>Consultez la liste des lots</Link> — toutes
        les fiches y sont accessibles sans scan.
      </p>
    </main>
  )
}

function BackToSale({ slug }) {
  return (
    <nav className="public-back">
      <Link to={`/v/${slug}`}>← Tous les lots</Link>
    </nav>
  )
}
