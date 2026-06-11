import { Router } from 'express'
import db from '../db/index.js'
import { cabinetUsage } from '../usage.js'
import { deleteFileQuiet } from '../uploads.js'

const router = Router()

// Tous les fichiers (refs + ressources) rattachés à un ensemble de lots.
function filePathsOfLots(lotIds) {
  if (lotIds.length === 0) return []
  const marks = lotIds.map(() => '?').join(',')
  const refs = db
    .prepare(`SELECT file_path FROM image_references WHERE lot_id IN (${marks})`)
    .all(...lotIds)
  const resources = db
    .prepare(`SELECT file_path FROM resources WHERE lot_id IN (${marks}) AND file_path IS NOT NULL`)
    .all(...lotIds)
  return [...refs, ...resources].map((r) => r.file_path)
}

function badRequest(res, message) {
  return res.status(400).json({ error: { code: 'BAD_REQUEST', message } })
}

// 404 volontairement indistinct : ne pas révéler l'existence des données d'autrui.
function notFound(res) {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable' } })
}

function getOwnedSale(req) {
  return db
    .prepare('SELECT * FROM sales WHERE id = ? AND cabinet_id = ?')
    .get(req.params.id ?? req.params.saleId, req.cabinetId)
}

function getOwnedLot(req) {
  return db
    .prepare(
      `SELECT l.*, s.cabinet_id, s.status AS sale_status
       FROM lots l JOIN sales s ON s.id = l.sale_id
       WHERE l.id = ? AND s.cabinet_id = ?`
    )
    .get(req.params.id, req.cabinetId)
}

function cabinetPlan(cabinetId) {
  return db
    .prepare(
      `SELECT p.* FROM plans p JOIN cabinets c ON c.plan_id = p.id WHERE c.id = ?`
    )
    .get(cabinetId)
}

// --- Slug : généré depuis le titre, unique, figé à la première publication ---

function slugify(title) {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // retire les accents (diacritiques combinants)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'vente'
  )
}

function uniqueSlug(title, excludeSaleId = null) {
  const base = slugify(title)
  let candidate = base
  for (let i = 2; ; i++) {
    const taken = db
      .prepare('SELECT id FROM sales WHERE slug = ?')
      .get(candidate)
    if (!taken || taken.id === excludeSaleId) return candidate
    candidate = `${base}-${i}`
  }
}

// --- Ventes ---

router.get('/sales', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM lots l WHERE l.sale_id = s.id) AS lot_count
         FROM sales s WHERE s.cabinet_id = ? ORDER BY s.created_at DESC`
      )
      .all(req.cabinetId)
  )
})

router.post('/sales', (req, res) => {
  const { title, description = '', event_date = null, location = '' } = req.body ?? {}
  if (typeof title !== 'string' || !title.trim()) return badRequest(res, 'Titre requis')
  if (event_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(event_date))
    return badRequest(res, 'Date invalide : format attendu AAAA-MM-JJ')

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO sales (cabinet_id, title, slug, description, event_date, location)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.cabinetId,
      title.trim(),
      uniqueSlug(title),
      String(description),
      event_date,
      String(location)
    )
  res.status(201).json(db.prepare('SELECT * FROM sales WHERE id = ?').get(lastInsertRowid))
})

router.get('/sales/:id', (req, res) => {
  const sale = getOwnedSale(req)
  if (!sale) return notFound(res)
  const lots = db
    .prepare(
      `SELECT l.*,
        (SELECT COUNT(*) FROM image_references ir WHERE ir.lot_id = l.id) AS image_count,
        (SELECT COUNT(*) FROM image_references ir WHERE ir.lot_id = l.id AND ir.is_active = 1) AS active_image_count,
        (SELECT COUNT(*) FROM resources r WHERE r.lot_id = l.id) AS resource_count
       FROM lots l WHERE l.sale_id = ? ORDER BY l.sort_order, l.id`
    )
    .all(sale.id)
  res.json({ ...sale, lots })
})

router.get('/usage', (req, res) => {
  const plan = cabinetPlan(req.cabinetId)
  res.json({ plan, usage: cabinetUsage(req.cabinetId) })
})

router.put('/sales/:id', (req, res) => {
  const sale = getOwnedSale(req)
  if (!sale) return notFound(res)

  const { title, description, event_date, location } = req.body ?? {}
  const next = { ...sale }

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) return badRequest(res, 'Titre invalide')
    next.title = title.trim()
    // Le slug suit le titre tant que la vente n'a jamais été publiée,
    // puis reste figé (les QR imprimés pointent dessus).
    if (!sale.published_at && next.title !== sale.title) {
      next.slug = uniqueSlug(next.title, sale.id)
    }
  }
  if (description !== undefined) next.description = String(description)
  if (location !== undefined) next.location = String(location)
  if (event_date !== undefined) {
    if (event_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(event_date))
      return badRequest(res, 'Date invalide : format attendu AAAA-MM-JJ')
    next.event_date = event_date
  }

  db.prepare(
    `UPDATE sales SET title = ?, slug = ?, description = ?, event_date = ?, location = ?,
     updated_at = datetime('now') WHERE id = ?`
  ).run(next.title, next.slug, next.description, next.event_date, next.location, sale.id)
  res.json(db.prepare('SELECT * FROM sales WHERE id = ?').get(sale.id))
})

router.delete('/sales/:id', (req, res) => {
  const sale = getOwnedSale(req)
  if (!sale) return notFound(res)
  if (sale.status !== 'draft') {
    return res.status(403).json({
      error: {
        code: 'SALE_NOT_DRAFT',
        message: 'Seule une vente en brouillon peut être supprimée — archivez-la sinon',
      },
    })
  }
  const lotIds = db.prepare('SELECT id FROM lots WHERE sale_id = ?').all(sale.id).map((l) => l.id)
  const files = filePathsOfLots(lotIds)
  db.prepare('DELETE FROM sales WHERE id = ?').run(sale.id)
  files.forEach(deleteFileQuiet)
  res.json({ ok: true })
})

const TRANSITIONS = {
  draft: ['published'],
  published: ['archived'],
  archived: ['published'],
}

router.put('/sales/:id/status', (req, res) => {
  const sale = getOwnedSale(req)
  if (!sale) return notFound(res)

  const { status } = req.body ?? {}
  if (!TRANSITIONS[sale.status]?.includes(status)) {
    return badRequest(
      res,
      `Transition impossible : ${sale.status} → ${status ?? '?'} (autorisées : ${TRANSITIONS[sale.status].join(', ')})`
    )
  }

  if (status === 'published') {
    const lotCount = db
      .prepare('SELECT COUNT(*) AS n FROM lots WHERE sale_id = ?')
      .get(sale.id).n
    if (lotCount === 0) {
      return badRequest(res, 'Publication impossible : la vente doit contenir au moins un lot')
    }
    const lotsWithActiveImage = db
      .prepare(
        `SELECT COUNT(*) AS n FROM lots l WHERE l.sale_id = ?
         AND EXISTS (SELECT 1 FROM image_references ir WHERE ir.lot_id = l.id AND ir.is_active = 1)`
      )
      .get(sale.id).n
    if (lotsWithActiveImage === 0) {
      return badRequest(
        res,
        'Publication impossible : au moins un lot doit porter une image de référence active'
      )
    }
    const plan = cabinetPlan(req.cabinetId)
    const activeSales = db
      .prepare(
        "SELECT COUNT(*) AS n FROM sales WHERE cabinet_id = ? AND status = 'published' AND id != ?"
      )
      .get(req.cabinetId, sale.id).n
    if (activeSales >= plan.max_active_sales) {
      return res.status(403).json({
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Quota du plan ${plan.name} atteint : ${plan.max_active_sales} vente(s) publiée(s) simultanée(s) maximum`,
        },
      })
    }
  }

  db.prepare(
    `UPDATE sales SET status = ?,
     published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN datetime('now') ELSE published_at END,
     updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, status, sale.id)
  res.json(db.prepare('SELECT * FROM sales WHERE id = ?').get(sale.id))
})

// --- Lots ---

function validateLotPayload(res, body, { partial = false } = {}) {
  const { lot_number, title, estimate_low, estimate_high } = body
  if (!partial || lot_number !== undefined) {
    if (typeof lot_number !== 'string' || !lot_number.trim())
      return badRequest(res, 'Numéro de lot requis')
  }
  if (!partial || title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) return badRequest(res, 'Titre requis')
  }
  for (const [label, value] of [['basse', estimate_low], ['haute', estimate_high]]) {
    if (value !== undefined && value !== null && (typeof value !== 'number' || value < 0))
      return badRequest(res, `Estimation ${label} invalide`)
  }
  return null
}

router.get('/sales/:saleId/lots', (req, res) => {
  const sale = getOwnedSale(req)
  if (!sale) return notFound(res)
  res.json(db.prepare('SELECT * FROM lots WHERE sale_id = ? ORDER BY sort_order, id').all(sale.id))
})

router.post('/sales/:saleId/lots', (req, res) => {
  const sale = getOwnedSale(req)
  if (!sale) return notFound(res)

  const body = req.body ?? {}
  const invalid = validateLotPayload(res, body)
  if (invalid) return invalid

  const plan = cabinetPlan(req.cabinetId)
  const lotCount = db.prepare('SELECT COUNT(*) AS n FROM lots WHERE sale_id = ?').get(sale.id).n
  if (lotCount >= plan.max_lots_per_sale) {
    return res.status(403).json({
      error: {
        code: 'QUOTA_EXCEEDED',
        message: `Quota du plan ${plan.name} atteint : ${plan.max_lots_per_sale} lots par vente maximum`,
      },
    })
  }

  const lotNumber = body.lot_number.trim()
  if (db.prepare('SELECT 1 FROM lots WHERE sale_id = ? AND lot_number = ?').get(sale.id, lotNumber)) {
    return res.status(409).json({
      error: { code: 'LOT_NUMBER_TAKEN', message: `Le lot n° ${lotNumber} existe déjà dans cette vente` },
    })
  }

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO lots (sale_id, lot_number, title, artist, description, estimate_low, estimate_high, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      sale.id,
      lotNumber,
      body.title.trim(),
      String(body.artist ?? ''),
      String(body.description ?? ''),
      body.estimate_low ?? null,
      body.estimate_high ?? null,
      Number.isInteger(body.sort_order) ? body.sort_order : lotCount
    )
  res.status(201).json(db.prepare('SELECT * FROM lots WHERE id = ?').get(lastInsertRowid))
})

router.get('/lots/:id', (req, res) => {
  const lot = getOwnedLot(req)
  if (!lot) return notFound(res)
  const sale = db.prepare('SELECT id, title, status FROM sales WHERE id = ?').get(lot.sale_id)
  const images = db
    .prepare('SELECT * FROM image_references WHERE lot_id = ? ORDER BY id')
    .all(lot.id)
  const resources = db
    .prepare('SELECT * FROM resources WHERE lot_id = ? ORDER BY sort_order, id')
    .all(lot.id)
  res.json({ ...lot, sale, images, resources })
})

router.put('/lots/:id', (req, res) => {
  const lot = getOwnedLot(req)
  if (!lot) return notFound(res)

  const body = req.body ?? {}
  const invalid = validateLotPayload(res, body, { partial: true })
  if (invalid) return invalid

  const next = { ...lot }
  if (body.lot_number !== undefined) {
    const lotNumber = body.lot_number.trim()
    const clash = db
      .prepare('SELECT id FROM lots WHERE sale_id = ? AND lot_number = ? AND id != ?')
      .get(lot.sale_id, lotNumber, lot.id)
    if (clash) {
      return res.status(409).json({
        error: { code: 'LOT_NUMBER_TAKEN', message: `Le lot n° ${lotNumber} existe déjà dans cette vente` },
      })
    }
    next.lot_number = lotNumber
  }
  if (body.title !== undefined) next.title = body.title.trim()
  if (body.artist !== undefined) next.artist = String(body.artist)
  if (body.description !== undefined) next.description = String(body.description)
  if (body.estimate_low !== undefined) next.estimate_low = body.estimate_low
  if (body.estimate_high !== undefined) next.estimate_high = body.estimate_high
  if (body.sort_order !== undefined && Number.isInteger(body.sort_order))
    next.sort_order = body.sort_order

  db.prepare(
    `UPDATE lots SET lot_number = ?, title = ?, artist = ?, description = ?,
     estimate_low = ?, estimate_high = ?, sort_order = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    next.lot_number,
    next.title,
    next.artist,
    next.description,
    next.estimate_low,
    next.estimate_high,
    next.sort_order,
    lot.id
  )
  res.json(db.prepare('SELECT * FROM lots WHERE id = ?').get(lot.id))
})

router.delete('/lots/:id', (req, res) => {
  const lot = getOwnedLot(req)
  if (!lot) return notFound(res)
  const files = filePathsOfLots([lot.id])
  db.prepare('DELETE FROM lots WHERE id = ?').run(lot.id)
  files.forEach(deleteFileQuiet)
  res.json({ ok: true })
})

export default router
