import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import SaleStatusBadge from './SaleStatusBadge.jsx'
import LotForm from './LotForm.jsx'
import CatalogKit from './CatalogKit.jsx'

export default function SaleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sale, setSale] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState({ title: '', event_date: '', location: '', description: '' })
  const [editingLotId, setEditingLotId] = useState(null)
  const [threshold, setThreshold] = useState('0.55')
  const [thresholdSaved, setThresholdSaved] = useState(false)

  async function load() {
    try {
      const s = await api(`/api/studio/sales/${id}`)
      setSale(s)
      setInfo({
        title: s.title,
        event_date: s.event_date ?? '',
        location: s.location,
        description: s.description,
      })
      setThreshold(String(s.recognition_threshold))
    } catch (e) {
      if (e.status === 404) setNotFound(true)
      else setError(e.message)
    }
  }

  useEffect(() => {
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveInfo(e) {
    e.preventDefault()
    setError(null)
    try {
      await api(`/api/studio/sales/${id}`, {
        method: 'PUT',
        body: { ...info, event_date: info.event_date || null },
      })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveThreshold(e) {
    e.preventDefault()
    setError(null)
    setThresholdSaved(false)
    try {
      await api(`/api/studio/sales/${id}`, {
        method: 'PUT',
        body: { recognition_threshold: Number(threshold) },
      })
      setThresholdSaved(true)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function changeStatus(status) {
    setError(null)
    try {
      await api(`/api/studio/sales/${id}/status`, { method: 'PUT', body: { status } })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeSale() {
    if (!window.confirm('Supprimer définitivement cette vente (brouillon) et ses lots ?')) return
    setError(null)
    try {
      await api(`/api/studio/sales/${id}`, { method: 'DELETE' })
      navigate('/studio')
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeLot(lotId) {
    if (!window.confirm('Supprimer ce lot ?')) return
    setError(null)
    try {
      await api(`/api/studio/lots/${lotId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (notFound) {
    return (
      <>
        <h1>Vente introuvable</h1>
        <Link to="/studio">← Retour à mes ventes</Link>
      </>
    )
  }
  if (!sale) return <p>Chargement…</p>

  function setField(field) {
    return (e) => setInfo((f) => ({ ...f, [field]: e.target.value }))
  }

  return (
    <>
      <p>
        <Link to="/studio">← Retour à mes ventes</Link>
      </p>
      <h1>
        {sale.title} <SaleStatusBadge status={sale.status} />
      </h1>
      <p>
        URL publique : <code>/v/{sale.slug}</code>
        {sale.published_at
          ? ' (figée — les QR imprimés pointent dessus)'
          : ' (suivra le titre jusqu’à la première publication)'}
      </p>

      <div className="actions">
        {sale.status === 'draft' && (
          <>
            <button type="button" onClick={() => changeStatus('published')}>
              Publier la vente
            </button>
            <button type="button" className="danger" onClick={removeSale}>
              Supprimer le brouillon
            </button>
          </>
        )}
        {sale.status === 'published' && (
          <button type="button" onClick={() => changeStatus('archived')}>
            Archiver la vente
          </button>
        )}
        {sale.status === 'archived' && (
          <button type="button" onClick={() => changeStatus('published')}>
            Republier la vente
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      <h2>Informations</h2>
      <form onSubmit={saveInfo} className="form">
        <label>
          Titre
          <input value={info.title} onChange={setField('title')} required />
        </label>
        <label>
          Date de la vente
          <input type="date" value={info.event_date} onChange={setField('event_date')} />
        </label>
        <label>
          Lieu
          <input value={info.location} onChange={setField('location')} />
        </label>
        <label>
          Description
          <textarea value={info.description} onChange={setField('description')} rows={3} />
        </label>
        <button type="submit">Enregistrer</button>
      </form>

      <h2>Reconnaissance (scan acheteur)</h2>
      <form onSubmit={saveThreshold} className="form">
        <label>
          Seuil de reconnaissance (0.40 – 0.70)
          <input
            type="number"
            min="0.40"
            max="0.70"
            step="0.01"
            value={threshold}
            onChange={(e) => {
              setThreshold(e.target.value)
              setThresholdSaved(false)
            }}
          />
        </label>
        <p className="quotas">
          Plage recommandée pour des images imprimées : <strong>0.50 – 0.60</strong>. Plus bas =
          détection plus facile mais plus de faux positifs ; plus haut = plus strict (exige bon
          éclairage et cadrage précis).
        </p>
        <button type="submit">Enregistrer le seuil</button>
        {thresholdSaved && <p>Seuil enregistré ✓</p>}
      </form>
      {sale.status === 'published' ? (
        <p>
          Mode test :{' '}
          <a href={`/v/${sale.slug}/scan?debug=1`} target="_blank" rel="noopener noreferrer">
            ouvrir le scan avec les scores affichés
          </a>{' '}
          — pointez la caméra sur vos images imprimées, relevez le score maximal de chacune, puis
          fixez le seuil à environ 90 % du score le plus bas observé.
        </p>
      ) : (
        <p className="quotas">
          Le mode test du scan sera disponible quand la vente sera publiée.
        </p>
      )}

      {sale.published_at && <CatalogKit slug={sale.slug} />}

      <h2>Lots ({sale.lots.length})</h2>
      {sale.lots.length === 0 ? (
        <p>Aucun lot — la vente ne pourra pas être publiée sans au moins un lot.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Titre</th>
              <th>Artiste</th>
              <th>Estimation</th>
              <th>Contenu</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sale.lots.map((lot) =>
              editingLotId === lot.id ? (
                <tr key={lot.id}>
                  <td colSpan={6}>
                    <LotForm
                      saleId={sale.id}
                      lot={lot}
                      onDone={() => {
                        setEditingLotId(null)
                        load()
                      }}
                      onCancel={() => setEditingLotId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={lot.id}>
                  <td>{lot.lot_number}</td>
                  <td>{lot.title}</td>
                  <td>{lot.artist || '—'}</td>
                  <td>
                    {lot.estimate_low != null && lot.estimate_high != null
                      ? `${lot.estimate_low} – ${lot.estimate_high} €`
                      : '—'}
                  </td>
                  <td>
                    <Link to={`/studio/lots/${lot.id}`}>
                      {lot.active_image_count}/{lot.image_count} img · {lot.resource_count} res
                    </Link>
                  </td>
                  <td className="row-actions">
                    <button type="button" onClick={() => setEditingLotId(lot.id)}>
                      Modifier
                    </button>
                    <button type="button" className="danger" onClick={() => removeLot(lot.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      <h3>Ajouter un lot</h3>
      <LotForm saleId={sale.id} onDone={load} />
    </>
  )
}
