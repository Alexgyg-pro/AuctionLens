// Vérification des conditions d'acceptation de l'EPIC 2 contre le serveur réel.
// Usage : node scripts/check-auth.mjs (démarre le serveur lui-même sur le port 3100)
import { spawn } from 'node:child_process'

const PORT = 3100
const BASE = `http://localhost:${PORT}`

const server = spawn('node', ['src/server.js'], {
  env: { ...process.env, PORT },
  stdio: 'ignore',
})

let failures = 0

function check(label, ok) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`)
  if (!ok) failures++
}

function cookieOf(res) {
  const raw = res.headers.get('set-cookie')
  return raw ? { value: raw.split(';')[0], raw } : null
}

async function req(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie.value } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => null), cookie: cookieOf(res) }
}

async function waitForServer(attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      await fetch(BASE + '/api/health')
      return
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new Error('serveur injoignable')
}

try {
  await waitForServer()

  // US-2.1 — identifiants invalides : message générique
  let r = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@auctionlens.local', password: 'mauvais' },
  })
  check('login invalide → 401', r.status === 401)
  check('message générique (ne révèle pas l\'email)', r.data?.error?.message === 'Email ou mot de passe incorrect')

  r = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'inconnu@nulle.part', password: 'x' },
  })
  check('email inconnu → même message', r.data?.error?.message === 'Email ou mot de passe incorrect')

  // US-2.1 — connexion admin
  r = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@auctionlens.local', password: 'admin123!' },
  })
  const adminCookie = r.cookie
  check('login admin → 200 + cookie de session', r.status === 200 && !!adminCookie)
  check('cookie HTTP-only', /httponly/i.test(adminCookie?.raw ?? ''))
  check('payload sans password_hash', JSON.stringify(r.data).includes('password') === false)

  // US-2.2 — /me
  r = await req('/api/auth/me', { cookie: adminCookie })
  check('GET /me admin → rôle admin', r.status === 200 && r.data?.user?.role === 'admin')

  // US-2.1 — connexion cabinet
  r = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'cabinet@auctionlens.local', password: 'cabinet123!' },
  })
  const cabinetCookie = r.cookie
  check('login cabinet → 200', r.status === 200)
  check(
    '/me cabinet expose plan et statut',
    r.data?.cabinet?.plan_name === 'Essentiel' && r.data?.cabinet?.subscription_status === 'active'
  )

  // US-2.3 — protections
  r = await req('/api/studio/quoi-que-ce-soit')
  check('visiteur → /api/studio/* = 401', r.status === 401)
  r = await req('/api/admin/quoi-que-ce-soit')
  check('visiteur → /api/admin/* = 401', r.status === 401)
  r = await req('/api/admin/quoi-que-ce-soit', { cookie: cabinetCookie })
  check('cabinet → /api/admin/* = 403', r.status === 403)
  r = await req('/api/studio/quoi-que-ce-soit', { cookie: adminCookie })
  check('admin → /api/studio/* = 403', r.status === 403)

  // US-2.2 — logout détruit la session côté serveur
  r = await req('/api/auth/logout', { method: 'POST', cookie: adminCookie })
  check('logout → 200', r.status === 200)
  r = await req('/api/auth/me', { cookie: adminCookie })
  check('ancienne session → /me = 401', r.status === 401)

  console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} échec(s).`)
} finally {
  server.kill()
}
process.exit(failures === 0 ? 0 : 1)
