import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api.js'

const EMPTY_FORM = {
  name: '',
  contact_email: '',
  plan_id: '',
  user_email: '',
  user_password: '',
}

export default function CabinetList() {
  const navigate = useNavigate()
  const [cabinets, setCabinets] = useState(null)
  const [plans, setPlans] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api('/api/admin/cabinets').then(setCabinets).catch((e) => setError(e.message))
    api('/api/admin/plans').then(setPlans).catch((e) => setError(e.message))
  }, [])

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const created = await api('/api/admin/cabinets', {
        method: 'POST',
        body: { ...form, plan_id: Number(form.plan_id) },
      })
      navigate(`/admin/cabinets/${created.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!cabinets) {
    return <p>Chargement…</p>
  }

  return (
    <>
      <h1>Cabinets</h1>
      {cabinets.length === 0 ? (
        <p>Aucun cabinet pour le moment.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Plan</th>
              <th>Statut</th>
              <th>Échéance</th>
            </tr>
          </thead>
          <tbody>
            {cabinets.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/admin/cabinets/${c.id}`}>{c.name}</Link>
                </td>
                <td>{c.plan_name}</td>
                <td>
                  <span className={`badge badge-${c.subscription_status}`}>
                    {c.subscription_status === 'active' ? 'Actif' : 'Suspendu'}
                  </span>
                </td>
                <td>{c.subscription_expires_at ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Nouveau cabinet</h2>
      <form onSubmit={handleCreate} className="form">
        <label>
          Raison sociale
          <input value={form.name} onChange={setField('name')} required />
        </label>
        <label>
          Email de contact
          <input type="email" value={form.contact_email} onChange={setField('contact_email')} required />
        </label>
        <label>
          Plan
          <select value={form.plan_id} onChange={setField('plan_id')} required>
            <option value="" disabled>
              Choisir un plan…
            </option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.price_monthly} €/mois
              </option>
            ))}
          </select>
        </label>
        <label>
          Email du premier utilisateur
          <input type="email" value={form.user_email} onChange={setField('user_email')} required />
        </label>
        <label>
          Mot de passe provisoire (8 caractères min.)
          <input
            type="text"
            value={form.user_password}
            onChange={setField('user_password')}
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Création…' : 'Créer le cabinet'}
        </button>
      </form>
    </>
  )
}
