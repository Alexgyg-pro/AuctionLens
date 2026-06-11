import { Router } from 'express'
import fs from 'node:fs'
import { imageSize } from 'image-size'
import db from '../db/index.js'
import { storageUsedBytes } from '../usage.js'
import { makeUploader, toRelPath, toAbsPath, deleteFileQuiet } from '../uploads.js'
import { lengthError } from '../validate.js'

const router = Router()

const MB = 1024 * 1024
const LIMITS = {
  image_ref: { mimes: ['image/jpeg', 'image/png'], maxBytes: 10 * MB },
  image_hd: { mimes: ['image/jpeg', 'image/png'], maxBytes: 15 * MB },
  pdf: { mimes: ['application/pdf'], maxBytes: 30 * MB },
  video: { mimes: ['video/mp4', 'video/webm', 'video/quicktime'], maxBytes: 200 * MB },
}
const RESOURCE_FILE_MIMES = [...LIMITS.image_hd.mimes, ...LIMITS.pdf.mimes, ...LIMITS.video.mimes]

const uploadImageRef = makeUploader(LIMITS.image_ref)
const uploadResource = makeUploader({ mimes: RESOURCE_FILE_MIMES, maxBytes: LIMITS.video.maxBytes })

function badRequest(res, message) {
  return res.status(400).json({ error: { code: 'BAD_REQUEST', message } })
}

function notFound(res) {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable' } })
}

function ownedLot(cabinetId, lotId) {
  return db
    .prepare(
      `SELECT l.* FROM lots l JOIN sales s ON s.id = l.sale_id
       WHERE l.id = ? AND s.cabinet_id = ?`
    )
    .get(lotId, cabinetId)
}

function ownedImageRef(cabinetId, id) {
  return db
    .prepare(
      `SELECT ir.* FROM image_references ir
       JOIN lots l ON l.id = ir.lot_id JOIN sales s ON s.id = l.sale_id
       WHERE ir.id = ? AND s.cabinet_id = ?`
    )
    .get(id, cabinetId)
}

function ownedResource(cabinetId, id) {
  return db
    .prepare(
      `SELECT r.* FROM resources r
       JOIN lots l ON l.id = r.lot_id JOIN sales s ON s.id = l.sale_id
       WHERE r.id = ? AND s.cabinet_id = ?`
    )
    .get(id, cabinetId)
}

function storageQuota(cabinetId) {
  const plan = db
    .prepare('SELECT p.name, p.max_storage_mb FROM plans p JOIN cabinets c ON c.plan_id = p.id WHERE c.id = ?')
    .get(cabinetId)
  return { plan, limitBytes: plan.max_storage_mb * MB, usedBytes: storageUsedBytes(cabinetId) }
}

function quotaError(res, plan) {
  return res.status(403).json({
    error: {
      code: 'QUOTA_EXCEEDED',
      message: `Quota de stockage du plan ${plan.name} atteint (${plan.max_storage_mb} Mo)`,
    },
  })
}

// Refuse avant d'écrire le fichier, sur la base de Content-Length.
// Un contrôle exact sur la taille réelle est refait après l'écriture.
function quotaPrecheck(req, res, next) {
  const declared = Number(req.headers['content-length'] ?? 0)
  const { plan, limitBytes, usedBytes } = storageQuota(req.cabinetId)
  if (declared > 0 && usedBytes + declared > limitBytes + 64 * 1024) {
    return quotaError(res, plan)
  }
  next()
}

function exactQuotaCheck(req, res) {
  const { plan, limitBytes, usedBytes } = storageQuota(req.cabinetId)
  if (usedBytes + req.file.size > limitBytes) {
    deleteFileQuiet(toRelPath(req.file.path))
    quotaError(res, plan)
    return false
  }
  return true
}

// --- Images de référence (plusieurs par lot, US-5.1) ---

router.post('/lots/:lotId/image-references', quotaPrecheck, uploadImageRef('file'), (req, res) => {
  const lot = ownedLot(req.cabinetId, req.params.lotId)
  if (!lot) {
    if (req.file) deleteFileQuiet(toRelPath(req.file.path))
    return notFound(res)
  }
  if (!req.file) return badRequest(res, 'Fichier image requis (champ « file », JPEG ou PNG)')
  const tooLong = lengthError(res, [['Label', req.body?.label, 100]])
  if (tooLong) {
    deleteFileQuiet(toRelPath(req.file.path))
    return tooLong
  }

  let dimensions
  try {
    dimensions = imageSize(fs.readFileSync(req.file.path))
  } catch {
    deleteFileQuiet(toRelPath(req.file.path))
    return badRequest(res, 'Image illisible ou corrompue')
  }
  if (dimensions.width < 224 || dimensions.height < 224) {
    deleteFileQuiet(toRelPath(req.file.path))
    return badRequest(
      res,
      `Image trop petite (${dimensions.width}×${dimensions.height}) : 224×224 px minimum, exigence du moteur de reconnaissance`
    )
  }
  if (!exactQuotaCheck(req, res)) return

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO image_references (lot_id, file_path, width, height, file_size, label)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      lot.id,
      toRelPath(req.file.path),
      dimensions.width,
      dimensions.height,
      req.file.size,
      String(req.body?.label ?? '')
    )
  res.status(201).json(db.prepare('SELECT * FROM image_references WHERE id = ?').get(lastInsertRowid))
})

router.put('/image-references/:id', (req, res) => {
  const ref = ownedImageRef(req.cabinetId, req.params.id)
  if (!ref) return notFound(res)

  const { label, is_active } = req.body ?? {}
  const tooLong = lengthError(res, [['Label', label, 100]])
  if (tooLong) return tooLong
  const next = { ...ref }
  if (label !== undefined) next.label = String(label)
  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') return badRequest(res, 'is_active doit être un booléen')
    next.is_active = is_active ? 1 : 0
  }

  db.prepare('UPDATE image_references SET label = ?, is_active = ? WHERE id = ?').run(
    next.label,
    next.is_active,
    ref.id
  )
  res.json(db.prepare('SELECT * FROM image_references WHERE id = ?').get(ref.id))
})

router.delete('/image-references/:id', (req, res) => {
  const ref = ownedImageRef(req.cabinetId, req.params.id)
  if (!ref) return notFound(res)
  db.prepare('DELETE FROM image_references WHERE id = ?').run(ref.id)
  deleteFileQuiet(ref.file_path)
  res.json({ ok: true })
})

// --- Ressources enrichies (US-5.2) ---

const RESOURCE_MIME_BY_TYPE = {
  image_hd: LIMITS.image_hd,
  pdf: LIMITS.pdf,
  video: LIMITS.video,
}

router.get('/lots/:lotId/resources', (req, res) => {
  const lot = ownedLot(req.cabinetId, req.params.lotId)
  if (!lot) return notFound(res)
  res.json(
    db.prepare('SELECT * FROM resources WHERE lot_id = ? ORDER BY sort_order, id').all(lot.id)
  )
})

router.post('/lots/:lotId/resources', quotaPrecheck, uploadResource('file'), (req, res) => {
  const cleanup = () => req.file && deleteFileQuiet(toRelPath(req.file.path))

  const lot = ownedLot(req.cabinetId, req.params.lotId)
  if (!lot) {
    cleanup()
    return notFound(res)
  }

  const { type, title, body } = req.body ?? {}
  if (typeof title !== 'string' || !title.trim()) {
    cleanup()
    return badRequest(res, 'Titre requis')
  }
  const tooLong = lengthError(res, [
    ['Titre', title, 200],
    ['Contenu', body, 20000],
  ])
  if (tooLong) {
    cleanup()
    return tooLong
  }

  let filePath = null
  let fileSize = 0
  let mimeType = null
  let textBody = null

  if (type === 'text') {
    if (req.file) cleanup()
    if (typeof body !== 'string' || !body.trim())
      return badRequest(res, 'Contenu texte requis (champ « body »)')
    textBody = body
  } else if (type === 'link') {
    if (req.file) cleanup()
    if (typeof body !== 'string' || !/^https?:\/\/\S+$/.test(body.trim()))
      return badRequest(res, 'URL invalide : elle doit commencer par http:// ou https://')
    textBody = body.trim()
  } else if (type in RESOURCE_MIME_BY_TYPE) {
    if (!req.file) return badRequest(res, 'Fichier requis (champ « file »)')
    const limit = RESOURCE_MIME_BY_TYPE[type]
    if (!limit.mimes.includes(req.file.mimetype)) {
      cleanup()
      return badRequest(res, `Type de fichier incompatible avec une ressource « ${type} »`)
    }
    if (req.file.size > limit.maxBytes) {
      cleanup()
      return badRequest(res, `Fichier trop volumineux pour « ${type} » (max ${limit.maxBytes / MB} Mo)`)
    }
    if (!exactQuotaCheck(req, res)) return
    filePath = toRelPath(req.file.path)
    fileSize = req.file.size
    mimeType = req.file.mimetype
  } else {
    cleanup()
    return badRequest(res, 'Type invalide : image_hd, video, pdf, text ou link')
  }

  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM resources WHERE lot_id = ?')
    .get(lot.id).n
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO resources (lot_id, type, title, body, file_path, file_size, mime_type, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(lot.id, type, title.trim(), textBody, filePath, fileSize, mimeType, maxOrder + 1)
  res.status(201).json(db.prepare('SELECT * FROM resources WHERE id = ?').get(lastInsertRowid))
})

router.put('/resources/:id', (req, res) => {
  const resource = ownedResource(req.cabinetId, req.params.id)
  if (!resource) return notFound(res)

  const { title, body, sort_order } = req.body ?? {}
  const tooLong = lengthError(res, [
    ['Titre', title, 200],
    ['Contenu', body, 20000],
  ])
  if (tooLong) return tooLong
  const next = { ...resource }

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) return badRequest(res, 'Titre invalide')
    next.title = title.trim()
  }
  if (body !== undefined) {
    if (resource.type === 'link' && !/^https?:\/\/\S+$/.test(String(body).trim()))
      return badRequest(res, 'URL invalide')
    if (!['text', 'link'].includes(resource.type))
      return badRequest(res, 'Seules les ressources texte et lien ont un contenu modifiable')
    next.body = String(body).trim()
  }
  if (sort_order !== undefined) {
    if (!Number.isInteger(sort_order) || sort_order < 0)
      return badRequest(res, 'sort_order invalide')
    next.sort_order = sort_order
  }

  db.prepare('UPDATE resources SET title = ?, body = ?, sort_order = ? WHERE id = ?').run(
    next.title,
    next.body,
    next.sort_order,
    resource.id
  )
  res.json(db.prepare('SELECT * FROM resources WHERE id = ?').get(resource.id))
})

router.delete('/resources/:id', (req, res) => {
  const resource = ownedResource(req.cabinetId, req.params.id)
  if (!resource) return notFound(res)
  db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id)
  deleteFileQuiet(resource.file_path)
  res.json({ ok: true })
})

export default router
