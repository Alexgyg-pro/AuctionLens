// Anti force brute sur le login : au-delà de MAX_FAILURES échecs en
// WINDOW_MS pour un même couple IP + email, les tentatives suivantes sont
// refusées (429) jusqu'à expiration de la fenêtre. Une connexion réussie
// remet le compteur à zéro. Stockage en mémoire : suffisant pour un seul
// processus serveur (cible v1).

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5

const failures = new Map() // 'ip|email' -> [timestamps des échecs]

function recentFailures(key) {
  const now = Date.now()
  const kept = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (kept.length === 0) failures.delete(key)
  else failures.set(key, kept)
  return kept
}

export function loginRateLimit(req, res, next) {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const key = `${req.ip}|${email}`

  if (recentFailures(key).length >= MAX_FAILURES) {
    return res.status(429).json({
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Trop de tentatives échouées — réessayez dans 15 minutes',
      },
    })
  }

  // Le routeur de login signale l'issue de la tentative via ces deux hooks.
  res.locals.noteLoginFailure = () => {
    failures.set(key, [...recentFailures(key), Date.now()])
  }
  res.locals.clearLoginFailures = () => {
    failures.delete(key)
  }
  next()
}
