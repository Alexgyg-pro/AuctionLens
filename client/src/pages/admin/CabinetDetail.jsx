import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api.js'

export default function CabinetDetail() {
  const { id } = useParams()
  const [cabinet, setCabinet] = useState(null)
  const [plans, setPlans] = useState([])
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')

  useEffect(() => {
    api(`/api/admin/cabinets/${id}`)
      .then((c) => {
        setCabinet(c)
        setExpiresAt(c.subscription_expires_at ?? '')
      })
      .catch((e) => (e.status === 404 ? setNotFound(true) : setError(e.message)))
    api('/api/admin/plans').then(setPlans).catch((e) => setError(e.message))
  }, [id])

  async function refresh() {
    setCabinet(await api(`/api/admin/cabinets/${id}`))
  }

  async function changePlan(e) {
    setError(null)
    try {
      await api(`/api/admin/cabinets/${id}`, {
        method: 'PUT',
        body: { plan_id: Number(e.target.value) },
      })
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function setSubscription(status) {
    setError(null)
    try {
      await api(`/api/admin/cabinets/${id}/subscription`, {
        method: 'PUT',
        body: expiresAt ? { status, expires_at: expiresAt } : { status },
      })
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  if (notFound) {
    return (
      <>
        <h1>Cabinet inconnu</h1>
        <Link to="/admin">← Retour à la liste</Link>
      </>
    )
  }
  if (!cabinet) {
    return <p>Chargement…</p>
  }

  const active = cabinet.subscription_status === 'active'
  const storageMb = (cabinet.usage.storage_bytes / (1024 * 1024)).toFixed(1)

  return (
    <>
      <p>
        <Link to="/admin">← Retour à la liste</Link>
      </p>
      <h1>{cabinet.name}</h1>
      <p>
        Contact : {cabinet.contact_email} — client depuis le {cabinet.created_at?.slice(0, 10)}
      </p>
      <p>
        Statut :{' '}
        <span className={`badge badge-${cabinet.subscription_status}`}>
          {active ? 'Actif' : 'Suspendu'}
        </span>{' '}
        — échéance : {cabinet.subscription_expires_at ?? '—'}
      </p>

      <h2>Consommation des quotas</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Quota</th>
            <th>Consommé</th>
            <th>Plan ({cabinet.plan_name})</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Ventes actives</td>
            <td>{cabinet.usage.active_sales}</td>
            <td>{cabinet.max_active_sales}</td>
          </tr>
          <tr>
            <td>Lots (total)</td>
            <td>{cabinet.usage.total_lots}</td>
            <td>{cabinet.max_lots_per_sale} / vente</td>
          </tr>
          <tr>
            <td>Stockage</td>
            <td>{storageMb} Mo</td>
            <td>{cabinet.max_storage_mb} Mo</td>
          </tr>
        </tbody>
      </table>

      <h2>Abonnement</h2>
      <div className="form">
        <label>
          Plan
          <select value={cabinet.plan_id} onChange={changePlan}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.price_monthly} €/mois
              </option>
            ))}
          </select>
        </label>
        <label>
          Échéance (appliquée au prochain changement de statut)
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        {active ? (
          <button type="button" className="danger" onClick={() => setSubscription('suspended')}>
            Suspendre l'abonnement
          </button>
        ) : (
          <button type="button" onClick={() => setSubscription('active')}>
            Réactiver l'abonnement
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <h2>Utilisateurs</h2>
      <ul>
        {cabinet.users.map((u) => (
          <li key={u.id}>{u.email}</li>
        ))}
      </ul>
    </>
  )
}
