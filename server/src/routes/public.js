import { Router } from 'express'
import db from '../db/index.js'

const router = Router()

// 404 indistinct : une vente draft, archivée, inexistante ou d'un cabinet
// suspendu donne exactement la même réponse — on ne révèle rien.
function notFound(res) {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Vente introuvable' } })
}

// Règle de visibilité publique : vente publiée ET cabinet actif.
// Toute requête de ce routeur passe par ce filtre.

router.get('/sales/:slug', (req, res) => {
  const sale = db
    .prepare(
      `SELECT s.id, s.title, s.slug, s.description, s.event_date, s.location,
              c.name AS cabinet_name
       FROM sales s
       JOIN cabinets c ON c.id = s.cabinet_id
       WHERE s.slug = ? AND s.status = 'published' AND c.subscription_status = 'active'`
    )
    .get(req.params.slug)
  if (!sale) return notFound(res)

  const lots = db
    .prepare(
      `SELECT l.id, l.lot_number, l.title, l.artist, l.estimate_low, l.estimate_high,
        (SELECT COUNT(*) FROM resources r WHERE r.lot_id = l.id) AS resource_count
       FROM lots l WHERE l.sale_id = ? ORDER BY l.sort_order, l.id`
    )
    .all(sale.id)

  res.json({ ...sale, lots })
})

router.get('/lots/:id', (req, res) => {
  const lot = db
    .prepare(
      `SELECT l.id, l.lot_number, l.title, l.artist, l.description,
              l.estimate_low, l.estimate_high,
              s.slug AS sale_slug, s.title AS sale_title
       FROM lots l
       JOIN sales s ON s.id = l.sale_id
       JOIN cabinets c ON c.id = s.cabinet_id
       WHERE l.id = ? AND s.status = 'published' AND c.subscription_status = 'active'`
    )
    .get(req.params.id)
  if (!lot) return notFound(res)

  const resources = db
    .prepare(
      `SELECT id, type, title, body, file_path, mime_type, sort_order
       FROM resources WHERE lot_id = ? ORDER BY sort_order, id`
    )
    .all(lot.id)

  res.json({ ...lot, resources })
})

export default router
