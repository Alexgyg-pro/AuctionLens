import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import SaleStatusBadge from './SaleStatusBadge.jsx'
import LotForm from './LotForm.jsx'

export default function SaleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sale, setSale] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState({ title: '', event_date: '', location: '', description: '' })
  const [editingLotId, setEditingLotId] = useState(null)

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sale.lots.map((lot) =>
              editingLotId === lot.id ? (
                <tr key={lot.id}>
                  <td colSpan={5}>
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
