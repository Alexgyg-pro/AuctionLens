import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api.js'
import SaleStatusBadge from './SaleStatusBadge.jsx'

const EMPTY_FORM = { title: '', event_date: '', location: '', description: '' }

export default function SalesList() {
  const navigate = useNavigate()
  const [sales, setSales] = useState(null)
  const [quotas, setQuotas] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api('/api/studio/sales').then(setSales).catch((e) => setError(e.message))
    api('/api/studio/usage').then(setQuotas).catch(() => {})
  }, [])

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const created = await api('/api/studio/sales', {
        method: 'POST',
        body: { ...form, event_date: form.event_date || null },
      })
      navigate(`/studio/sales/${created.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!sales) return <p>Chargement…</p>

  return (
    <>
      <h1>Mes ventes</h1>
      {quotas && (
        <p className="quotas">
          Plan <strong>{quotas.plan.name}</strong> — ventes publiées :{' '}
          {quotas.usage.active_sales}/{quotas.plan.max_active_sales} · lots :{' '}
          {quotas.usage.total_lots} (max {quotas.plan.max_lots_per_sale}/vente) · stockage :{' '}
          {(quotas.usage.storage_bytes / (1024 * 1024)).toFixed(1)}/
          {quotas.plan.max_storage_mb} Mo
        </p>
      )}
      {sales.length === 0 ? (
        <p>Aucune vente pour le moment — créez la première ci-dessous.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Titre</th>
              <th>Statut</th>
              <th>Lots</th>
              <th>Date</th>
              <th>URL publique</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/studio/sales/${s.id}`}>{s.title}</Link>
                </td>
                <td>
                  <SaleStatusBadge status={s.status} />
                </td>
                <td>{s.lot_count}</td>
                <td>{s.event_date ?? '—'}</td>
                <td>
                  <code>/v/{s.slug}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Nouvelle vente</h2>
      <form onSubmit={handleCreate} className="form">
        <label>
          Titre
          <input value={form.title} onChange={setField('title')} required />
        </label>
        <label>
          Date de la vente
          <input type="date" value={form.event_date} onChange={setField('event_date')} />
        </label>
        <label>
          Lieu
          <input value={form.location} onChange={setField('location')} />
        </label>
        <label>
          Description
          <textarea value={form.description} onChange={setField('description')} rows={3} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Création…' : 'Créer la vente (brouillon)'}
        </button>
      </form>
    </>
  )
}
