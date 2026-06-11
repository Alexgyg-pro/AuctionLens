// Vérification des conditions d'acceptation de l'EPIC 3 contre le serveur réel.
// Usage : node scripts/check-admin.mjs (démarre le serveur lui-même sur le port 3100)
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

async function req(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie')
  return {
    status: res.status,
    data: await res.json().catch(() => null),
    cookie: setCookie ? setCookie.split(';')[0] : null,
  }
}

async function login(email, password) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password } })
  return { ...r, cookie: r.cookie }
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

  const admin = await login('admin@auctionlens.local', 'admin123!')
  check('login admin', admin.status === 200)
  const adminCookie = admin.cookie

  // US-3.1 — création d'un cabinet + premier utilisateur
  const stamp = Date.now()
  const userEmail = `martin-${stamp}@cabinet.test`
  let r = await req('/api/admin/cabinets', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      name: 'Études Martin',
      contact_email: 'contact@etudes-martin.test',
      plan_id: 1,
      user_email: userEmail,
      user_password: 'provisoire1!',
    },
  })
  const cabinetId = r.data?.id
  check('création cabinet → 201', r.status === 201 && !!cabinetId)
  check('créé actif avec échéance', r.data?.subscription_status === 'active' && !!r.data?.subscription_expires_at)

  // Email déjà pris → message clair
  r = await req('/api/admin/cabinets', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      name: 'Doublon',
      contact_email: 'x@y.test',
      plan_id: 1,
      user_email: userEmail,
      user_password: 'provisoire1!',
    },
  })
  check('email déjà pris → 409 + message clair', r.status === 409 && /déjà utilisé/.test(r.data?.error?.message ?? ''))

  // Le nouvel utilisateur peut se connecter au studio
  const newCab = await login(userEmail, 'provisoire1!')
  check('le nouvel utilisateur cabinet se connecte', newCab.status === 200 && newCab.data?.cabinet?.name === 'Études Martin')

  // US-3.2 — détail avec consommation des quotas
  r = await req(`/api/admin/cabinets/${cabinetId}`, { cookie: adminCookie })
  check(
    'fiche cabinet : plan, statut, échéance, usage',
    r.data?.plan_name === 'Essentiel' &&
      r.data?.usage?.active_sales === 0 &&
      r.data?.usage?.total_lots === 0 &&
      r.data?.usage?.storage_bytes === 0 &&
      r.data?.users?.length === 1
  )

  // Changement de plan → quotas du nouveau plan exposés immédiatement
  r = await req(`/api/admin/cabinets/${cabinetId}`, {
    method: 'PUT',
    cookie: adminCookie,
    body: { plan_id: 2 },
  })
  check('changement de plan immédiat', r.status === 200 && r.data?.plan_name === 'Pro' && r.data?.max_active_sales === 5)

  // US-3.3 — suspension effective immédiatement, même avec session existante
  r = await req(`/api/admin/cabinets/${cabinetId}/subscription`, {
    method: 'PUT',
    cookie: adminCookie,
    body: { status: 'suspended' },
  })
  check('suspension → 200', r.status === 200 && r.data?.subscription_status === 'suspended')

  r = await req('/api/studio/ping', { cookie: newCab.cookie })
  check(
    'cabinet suspendu bloqué au studio (session existante)',
    r.status === 403 && r.data?.error?.code === 'SUBSCRIPTION_SUSPENDED'
  )

  // Réactivation → studio refonctionne (404 = a passé l'auth, route inexistante)
  r = await req(`/api/admin/cabinets/${cabinetId}/subscription`, {
    method: 'PUT',
    cookie: adminCookie,
    body: { status: 'active', expires_at: '2027-06-11' },
  })
  check('réactivation + échéance', r.status === 200 && r.data?.subscription_expires_at === '2027-06-11')

  r = await req('/api/studio/ping', { cookie: newCab.cookie })
  check('cabinet réactivé repasse l\'auth studio', r.status === 404)

  // Validations
  r = await req('/api/admin/cabinets', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: '', contact_email: 'bad', plan_id: 99, user_email: 'bad', user_password: 'x' },
  })
  check('payload invalide → 400', r.status === 400)

  r = await req('/api/admin/cabinets/99999', { cookie: adminCookie })
  check('cabinet inconnu → 404', r.status === 404)

  console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} échec(s).`)
} finally {
  server.kill()
  // Nettoyage : ne pas laisser les cabinets de test dans la base de dev.
  const { default: db } = await import('../src/db/index.js')
  db.prepare(
    "DELETE FROM cabinets WHERE contact_email IN ('contact@etudes-martin.test', 'x@y.test')"
  ).run()
}
process.exit(failures === 0 ? 0 : 1)
