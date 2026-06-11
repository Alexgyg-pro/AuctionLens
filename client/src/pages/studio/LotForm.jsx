import { useState } from 'react'
import { api } from '../../api.js'

// Formulaire de lot : création (lot absent) ou édition (lot fourni).
export default function LotForm({ saleId, lot, onDone, onCancel }) {
  const [form, setForm] = useState({
    lot_number: lot?.lot_number ?? '',
    title: lot?.title ?? '',
    artist: lot?.artist ?? '',
    description: lot?.description ?? '',
    estimate_low: lot?.estimate_low ?? '',
    estimate_high: lot?.estimate_high ?? '',
  })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const body = {
      ...form,
      estimate_low: form.estimate_low === '' ? null : Number(form.estimate_low),
      estimate_high: form.estimate_high === '' ? null : Number(form.estimate_high),
    }
    try {
      if (lot) {
        await api(`/api/studio/lots/${lot.id}`, { method: 'PUT', body })
      } else {
        await api(`/api/studio/sales/${saleId}/lots`, { method: 'POST', body })
        setForm({
          lot_number: '',
          title: '',
          artist: '',
          description: '',
          estimate_low: '',
          estimate_high: '',
        })
      }
      onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form form-inline">
      <div className="form-row">
        <label>
          N° de lot
          <input value={form.lot_number} onChange={setField('lot_number')} required size={6} />
        </label>
        <label>
          Titre
          <input value={form.title} onChange={setField('title')} required />
        </label>
        <label>
          Artiste
          <input value={form.artist} onChange={setField('artist')} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Estimation basse (€)
          <input
            type="number"
            min="0"
            value={form.estimate_low}
            onChange={setField('estimate_low')}
          />
        </label>
        <label>
          Estimation haute (€)
          <input
            type="number"
            min="0"
            value={form.estimate_high}
            onChange={setField('estimate_high')}
          />
        </label>
      </div>
      <label>
        Notice / description
        <textarea value={form.description} onChange={setField('description')} rows={2} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-row">
        <button type="submit" disabled={submitting}>
          {lot ? 'Enregistrer le lot' : 'Ajouter le lot'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}
