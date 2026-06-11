import db from '../db/index.js'

export function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Connexion requise' } })
  }
  next()
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.session.role !== 'admin') {
      return res
        .status(403)
        .json({ error: { code: 'FORBIDDEN', message: 'Accès réservé aux administrateurs' } })
    }
    next()
  })
}

// Vérifie à chaque requête que le cabinet est toujours actif :
// une suspension par l'admin doit être effective immédiatement,
// même si la session du cabinet existe encore.
export function requireCabinet(req, res, next) {
  requireAuth(req, res, () => {
    if (req.session.role !== 'cabinet') {
      return res
        .status(403)
        .json({ error: { code: 'FORBIDDEN', message: 'Accès réservé aux cabinets' } })
    }
    const cabinet = db
      .prepare('SELECT id, subscription_status FROM cabinets WHERE id = ?')
      .get(req.session.cabinetId)
    if (!cabinet || cabinet.subscription_status !== 'active') {
      return res.status(403).json({
        error: {
          code: 'SUBSCRIPTION_SUSPENDED',
          message: 'Abonnement suspendu — contactez AuctionLens',
        },
      })
    }
    req.cabinetId = cabinet.id
    next()
  })
}
