import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { loginRateLimit } from '../middleware/rateLimit.js'

const router = Router()

const LOGIN_ERROR = {
  error: { code: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' },
}

router.post('/login', loginRateLimit, (req, res) => {
  const { email, password } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Email et mot de passe requis' },
    })
  }

  const user = db
    .prepare('SELECT id, email, password_hash, role, cabinet_id FROM users WHERE email = ?')
    .get(email.trim().toLowerCase())

  // Message générique : ne pas révéler si l'email existe.
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.locals.noteLoginFailure()
    return res.status(401).json(LOGIN_ERROR)
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: { code: 'INTERNAL', message: 'Erreur serveur' } })
    req.session.userId = user.id
    req.session.role = user.role
    req.session.cabinetId = user.cabinet_id
    res.locals.clearLoginFailures()
    res.json(currentUserPayload(user.id))
  })
})

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: { code: 'INTERNAL', message: 'Erreur serveur' } })
    res.clearCookie('auctionlens.sid')
    res.json({ ok: true })
  })
})

router.get('/me', requireAuth, (req, res) => {
  const payload = currentUserPayload(req.session.userId)
  if (!payload) {
    return req.session.destroy(() =>
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Connexion requise' } })
    )
  }
  res.json(payload)
})

function currentUserPayload(userId) {
  const user = db
    .prepare('SELECT id, email, role, cabinet_id FROM users WHERE id = ?')
    .get(userId)
  if (!user) return null

  let cabinet = null
  if (user.role === 'cabinet' && user.cabinet_id) {
    cabinet = db
      .prepare(
        `SELECT c.id, c.name, c.subscription_status, c.subscription_expires_at,
                p.name AS plan_name, p.max_active_sales, p.max_lots_per_sale, p.max_storage_mb
         FROM cabinets c JOIN plans p ON p.id = c.plan_id
         WHERE c.id = ?`
      )
      .get(user.cabinet_id)
  }

  return {
    user: { id: user.id, email: user.email, role: user.role },
    cabinet,
  }
}

export default router
