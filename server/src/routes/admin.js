import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../db/index.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function badRequest(res, message) {
  return res.status(400).json({ error: { code: 'BAD_REQUEST', message } })
}

// Les tables de l'EPIC 4+ n'existent pas encore : les compteurs valent 0
// tant qu'elles ne sont pas créées, puis deviennent réels sans changer ce code.
function tableExists(name) {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name)
}

function cabinetUsage(cabinetId) {
  const usage = { active_sales: 0, total_lots: 0, storage_bytes: 0 }
  if (tableExists('sales')) {
    usage.active_sales = db
      .prepare("SELECT COUNT(*) AS n FROM sales WHERE cabinet_id = ? AND status = 'published'")
      .get(cabinetId).n
  }
  if (tableExists('lots')) {
    usage.total_lots = db
      .prepare(
        'SELECT COUNT(*) AS n FROM lots l JOIN sales s ON s.id = l.sale_id WHERE s.cabinet_id = ?'
      )
      .get(cabinetId).n
  }
  if (tableExists('image_references')) {
    usage.storage_bytes += db
      .prepare(
        `SELECT COALESCE(SUM(ir.file_size), 0) AS n
         FROM image_references ir
         JOIN lots l ON l.id = ir.lot_id
         JOIN sales s ON s.id = l.sale_id
         WHERE s.cabinet_id = ?`
      )
      .get(cabinetId).n
  }
  if (tableExists('resources')) {
    usage.storage_bytes += db
      .prepare(
        `SELECT COALESCE(SUM(r.file_size), 0) AS n
         FROM resources r
         JOIN lots l ON l.id = r.lot_id
         JOIN sales s ON s.id = l.sale_id
         WHERE s.cabinet_id = ?`
      )
      .get(cabinetId).n
  }
  return usage
}

const CABINET_SELECT = `
  SELECT c.id, c.name, c.contact_email, c.subscription_status, c.subscription_expires_at,
         c.created_at, c.plan_id, p.name AS plan_name,
         p.max_active_sales, p.max_lots_per_sale, p.max_storage_mb
  FROM cabinets c
  JOIN plans p ON p.id = c.plan_id
`

router.get('/plans', (req, res) => {
  res.json(db.prepare('SELECT * FROM plans ORDER BY price_monthly').all())
})

router.get('/cabinets', (req, res) => {
  res.json(db.prepare(`${CABINET_SELECT} ORDER BY c.created_at DESC`).all())
})

router.post('/cabinets', (req, res) => {
  const { name, contact_email, plan_id, user_email, user_password } = req.body ?? {}

  if (typeof name !== 'string' || !name.trim()) return badRequest(res, 'Nom du cabinet requis')
  if (typeof contact_email !== 'string' || !EMAIL_RE.test(contact_email))
    return badRequest(res, 'Email de contact invalide')
  if (typeof user_email !== 'string' || !EMAIL_RE.test(user_email))
    return badRequest(res, "Email de l'utilisateur invalide")
  if (typeof user_password !== 'string' || user_password.length < 8)
    return badRequest(res, 'Mot de passe provisoire : 8 caractères minimum')

  const plan = db.prepare('SELECT id FROM plans WHERE id = ?').get(plan_id)
  if (!plan) return badRequest(res, 'Plan inconnu')

  const email = user_email.trim().toLowerCase()
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({
      error: { code: 'EMAIL_TAKEN', message: 'Cet email utilisateur est déjà utilisé' },
    })
  }

  const cabinetId = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO cabinets (name, contact_email, plan_id, subscription_status, subscription_expires_at)
         VALUES (?, ?, ?, 'active', date('now', '+1 month'))`
      )
      .run(name.trim(), contact_email.trim(), plan.id)
    db.prepare(
      "INSERT INTO users (email, password_hash, role, cabinet_id) VALUES (?, ?, 'cabinet', ?)"
    ).run(email, bcrypt.hashSync(user_password, 10), lastInsertRowid)
    return lastInsertRowid
  })()

  res.status(201).json(db.prepare(`${CABINET_SELECT} WHERE c.id = ?`).get(cabinetId))
})

router.get('/cabinets/:id', (req, res) => {
  const cabinet = db.prepare(`${CABINET_SELECT} WHERE c.id = ?`).get(req.params.id)
  if (!cabinet) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Cabinet inconnu' } })
  }
  const users = db
    .prepare('SELECT id, email, created_at FROM users WHERE cabinet_id = ?')
    .all(cabinet.id)
  res.json({ ...cabinet, usage: cabinetUsage(cabinet.id), users })
})

router.put('/cabinets/:id', (req, res) => {
  const cabinet = db.prepare('SELECT * FROM cabinets WHERE id = ?').get(req.params.id)
  if (!cabinet) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Cabinet inconnu' } })
  }

  const { name, contact_email, plan_id } = req.body ?? {}
  const next = {
    name: cabinet.name,
    contact_email: cabinet.contact_email,
    plan_id: cabinet.plan_id,
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return badRequest(res, 'Nom invalide')
    next.name = name.trim()
  }
  if (contact_email !== undefined) {
    if (typeof contact_email !== 'string' || !EMAIL_RE.test(contact_email))
      return badRequest(res, 'Email de contact invalide')
    next.contact_email = contact_email.trim()
  }
  if (plan_id !== undefined) {
    if (!db.prepare('SELECT 1 FROM plans WHERE id = ?').get(plan_id))
      return badRequest(res, 'Plan inconnu')
    next.plan_id = plan_id
  }

  db.prepare('UPDATE cabinets SET name = ?, contact_email = ?, plan_id = ? WHERE id = ?').run(
    next.name,
    next.contact_email,
    next.plan_id,
    cabinet.id
  )
  res.json(db.prepare(`${CABINET_SELECT} WHERE c.id = ?`).get(cabinet.id))
})

router.put('/cabinets/:id/subscription', (req, res) => {
  const cabinet = db.prepare('SELECT id FROM cabinets WHERE id = ?').get(req.params.id)
  if (!cabinet) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Cabinet inconnu' } })
  }

  const { status, expires_at } = req.body ?? {}
  if (!['active', 'suspended'].includes(status)) {
    return badRequest(res, "Statut invalide : 'active' ou 'suspended'")
  }
  if (expires_at !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(expires_at ?? '')) {
    return badRequest(res, "Échéance invalide : format attendu AAAA-MM-JJ")
  }

  if (expires_at !== undefined) {
    db.prepare(
      'UPDATE cabinets SET subscription_status = ?, subscription_expires_at = ? WHERE id = ?'
    ).run(status, expires_at, cabinet.id)
  } else {
    db.prepare('UPDATE cabinets SET subscription_status = ? WHERE id = ?').run(status, cabinet.id)
  }
  res.json(db.prepare(`${CABINET_SELECT} WHERE c.id = ?`).get(cabinet.id))
})

export default router
