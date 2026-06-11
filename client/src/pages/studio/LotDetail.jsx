import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../../api.js'

export default function LotDetail() {
  const { id } = useParams()
  const [lot, setLot] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    try {
      setLot(await api(`/api/studio/lots/${id}`))
    } catch (e) {
      if (e.status === 404) setNotFound(true)
      else setError(e.message)
    }
  }

  useEffect(() => {
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (notFound) {
    return (
      <>
        <h1>Lot introuvable</h1>
        <Link to="/studio">← Retour à mes ventes</Link>
      </>
    )
  }
  if (!lot) return <p>Chargement…</p>

  return (
    <>
      <p>
        <Link to={`/studio/sales/${lot.sale.id}`}>← Retour à « {lot.sale.title} »</Link>
      </p>
      <h1>
        Lot {lot.lot_number} — {lot.title}
      </h1>
      {error && <p className="error">{error}</p>}

      <ImageRefSection lot={lot} onChange={load} onError={setError} />
      <ResourceSection lot={lot} onChange={load} onError={setError} />
    </>
  )
}

// --- Images de référence ---

function ImageRefSection({ lot, onChange, onError }) {
  const [file, setFile] = useState(null)
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  async function upload(e) {
    e.preventDefault()
    if (!file) return
    onError(null)
    setSubmitting(true)
    const form = new FormData()
    form.append('file', file)
    form.append('label', label)
    try {
      const res = await fetch(`/api/studio/lots/${lot.id}/image-references`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new ApiError(res.status, data?.error?.code, data?.error?.message ?? 'Erreur')
      setFile(null)
      setLabel('')
      setFileInputKey((k) => k + 1)
      onChange()
    } catch (err) {
      onError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(ref) {
    onError(null)
    try {
      await api(`/api/studio/image-references/${ref.id}`, {
        method: 'PUT',
        body: { is_active: !ref.is_active },
      })
      onChange()
    } catch (err) {
      onError(err.message)
    }
  }

  async function remove(ref) {
    if (!window.confirm('Supprimer cette image de référence ?')) return
    onError(null)
    try {
      await api(`/api/studio/image-references/${ref.id}`, { method: 'DELETE' })
      onChange()
    } catch (err) {
      onError(err.message)
    }
  }

  return (
    <section>
      <h2>Images de référence ({lot.images.length})</h2>
      <p className="notice">
        Ces images seront reconnues par la caméra des acheteurs. Conseils : fond neutre et
        uniforme, éclairage diffus sans ombres, l'objet doit occuper 60–80&nbsp;% du cadre,
        image nette d'au moins 224×224&nbsp;px. Pour une pièce importante présentée sous
        plusieurs vues dans le catalogue, ajoutez une image par vue : chacune mènera à la
        même fiche.
      </p>

      {lot.images.length > 0 && (
        <ul className="media-list">
          {lot.images.map((ref) => (
            <li key={ref.id} className={ref.is_active ? '' : 'inactive'}>
              <img src={`/uploads/${ref.file_path}`} alt={ref.label || `Image ${ref.id}`} />
              <div>
                <strong>{ref.label || '(sans label)'}</strong>
                <br />
                {ref.width}×{ref.height} px — {(ref.file_size / 1024).toFixed(0)} Ko
                {!ref.is_active && ' — désactivée (hors reconnaissance)'}
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => toggleActive(ref)}>
                  {ref.is_active ? 'Désactiver' : 'Réactiver'}
                </button>
                <button type="button" className="danger" onClick={() => remove(ref)}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={upload} className="form form-inline">
        <div className="form-row">
          <label>
            Image (JPEG/PNG, ≥ 224×224 px, 10 Mo max)
            <input
              key={fileInputKey}
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files[0] ?? null)}
              required
            />
          </label>
          <label>
            Label (ex. « vue de face », « détail signature »)
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={submitting || !file}>
          {submitting ? 'Envoi…' : "Ajouter l'image de référence"}
        </button>
      </form>
    </section>
  )
}

// --- Ressources enrichies ---

const TYPE_LABELS = {
  image_hd: 'Image HD',
  video: 'Vidéo',
  pdf: 'PDF',
  text: 'Texte d’expertise',
  link: 'Lien externe',
}

function ResourceSection({ lot, onChange, onError }) {
  const [editingId, setEditingId] = useState(null)

  async function move(resource, direction) {
    const ordered = lot.resources
    const index = ordered.findIndex((r) => r.id === resource.id)
    const other = ordered[index + direction]
    if (!other) return
    onError(null)
    try {
      await api(`/api/studio/resources/${resource.id}`, {
        method: 'PUT',
        body: { sort_order: other.sort_order },
      })
      await api(`/api/studio/resources/${other.id}`, {
        method: 'PUT',
        body: { sort_order: resource.sort_order },
      })
      onChange()
    } catch (err) {
      onError(err.message)
    }
  }

  async function remove(resource) {
    if (!window.confirm('Supprimer cette ressource ?')) return
    onError(null)
    try {
      await api(`/api/studio/resources/${resource.id}`, { method: 'DELETE' })
      onChange()
    } catch (err) {
      onError(err.message)
    }
  }

  return (
    <section>
      <h2>Ressources enrichies ({lot.resources.length})</h2>
      {lot.resources.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Ordre</th>
              <th>Type</th>
              <th>Titre</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lot.resources.map((r, i) =>
              editingId === r.id ? (
                <tr key={r.id}>
                  <td colSpan={4}>
                    <EditResourceForm
                      resource={r}
                      onDone={() => {
                        setEditingId(null)
                        onChange()
                      }}
                      onCancel={() => setEditingId(null)}
                      onError={onError}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td>
                    <button type="button" disabled={i === 0} onClick={() => move(r, -1)}>
                      ↑
                    </button>{' '}
                    <button
                      type="button"
                      disabled={i === lot.resources.length - 1}
                      onClick={() => move(r, +1)}
                    >
                      ↓
                    </button>
                  </td>
                  <td>{TYPE_LABELS[r.type]}</td>
                  <td>
                    {r.title}
                    {r.file_path && (
                      <>
                        {' '}
                        <a href={`/uploads/${r.file_path}`} target="_blank" rel="noreferrer">
                          (fichier)
                        </a>
                      </>
                    )}
                    {r.type === 'link' && (
                      <>
                        {' '}
                        <a href={r.body} target="_blank" rel="noreferrer">
                          (ouvrir)
                        </a>
                      </>
                    )}
                  </td>
                  <td className="row-actions">
                    <button type="button" onClick={() => setEditingId(r.id)}>
                      Modifier
                    </button>
                    <button type="button" className="danger" onClick={() => remove(r)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      <h3>Ajouter une ressource</h3>
      <AddResourceForm lotId={lot.id} onDone={onChange} onError={onError} />
    </section>
  )
}

function EditResourceForm({ resource, onDone, onCancel, onError }) {
  const [title, setTitle] = useState(resource.title)
  const [body, setBody] = useState(resource.body ?? '')

  async function save(e) {
    e.preventDefault()
    onError(null)
    try {
      const payload = { title }
      if (['text', 'link'].includes(resource.type)) payload.body = body
      await api(`/api/studio/resources/${resource.id}`, { method: 'PUT', body: payload })
      onDone()
    } catch (err) {
      onError(err.message)
    }
  }

  return (
    <form onSubmit={save} className="form form-inline">
      <label>
        Titre
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      {resource.type === 'text' && (
        <label>
          Contenu
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
        </label>
      )}
      {resource.type === 'link' && (
        <label>
          URL
          <input type="url" value={body} onChange={(e) => setBody(e.target.value)} required />
        </label>
      )}
      <div className="form-row">
        <button type="submit">Enregistrer</button>
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}

function AddResourceForm({ lotId, onDone, onError }) {
  const [type, setType] = useState('image_hd')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  const isFileType = ['image_hd', 'video', 'pdf'].includes(type)

  async function submit(e) {
    e.preventDefault()
    onError(null)
    setSubmitting(true)
    try {
      if (isFileType) {
        const form = new FormData()
        form.append('type', type)
        form.append('title', title)
        form.append('file', file)
        const res = await fetch(`/api/studio/lots/${lotId}/resources`, {
          method: 'POST',
          body: form,
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new ApiError(res.status, data?.error?.code, data?.error?.message ?? 'Erreur')
      } else {
        await api(`/api/studio/lots/${lotId}/resources`, {
          method: 'POST',
          body: { type, title, body },
        })
      }
      setTitle('')
      setBody('')
      setFile(null)
      setFileInputKey((k) => k + 1)
      onDone()
    } catch (err) {
      onError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="form form-inline">
      <div className="form-row">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Titre
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
      </div>
      {type === 'video' && (
        <p className="notice">
          Pour les vidéos volumineuses, préférez le type « Lien externe » vers YouTube ou
          Vimeo : lecture plus fluide pour l'acheteur et quota de stockage préservé.
        </p>
      )}
      {isFileType && (
        <label>
          Fichier ({type === 'image_hd' ? 'JPEG/PNG, 15 Mo max' : type === 'pdf' ? 'PDF, 30 Mo max' : 'MP4/WebM/MOV, 200 Mo max'})
          <input
            key={fileInputKey}
            type="file"
            accept={
              type === 'image_hd'
                ? 'image/jpeg,image/png'
                : type === 'pdf'
                  ? 'application/pdf'
                  : 'video/mp4,video/webm,video/quicktime'
            }
            onChange={(e) => setFile(e.target.files[0] ?? null)}
            required
          />
        </label>
      )}
      {type === 'text' && (
        <label>
          Texte d'expertise
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
        </label>
      )}
      {type === 'link' && (
        <label>
          URL (article de presse, vidéo YouTube…)
          <input
            type="url"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="https://…"
            required
          />
        </label>
      )}
      <button type="submit" disabled={submitting || (isFileType && !file)}>
        {submitting ? 'Envoi…' : 'Ajouter la ressource'}
      </button>
    </form>
  )
}
