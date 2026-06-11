// Vérification des conditions d'acceptation de l'EPIC 8 (US-8.2) contre le
// serveur réel : rate limiting du login, erreurs JSON cohérentes, plafonds
// de longueur des champs texte.
// Usage : node scripts/check-hardening.mjs (démarre le serveur sur le port 3100)
import { spawn } from 'node:child_process'

const PORT = 3100
const BASE = `http://localhost:${PORT}`

const stamp = Date.now()

const server = spawn('node', ['src/server.js'], {
  env: { ...process.env, PORT },
  stdio: 'ignore',
})

let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures++
}

async function req(path, { method = 'GET', body, cookie, rawBody } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body || rawBody ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: rawBody ?? (body ? JSON.stringify(body) : undefined),
  })
  const setCookie = res.headers.get('set-cookie')
  return {
    status: res.status,
    data: await res.json().catch(() => null),
    cookie: setCookie ? setCookie.split(';')[0] : null,
  }
}

async function login(email, password) {
  return req('/api/auth/login', { method: 'POST', body: { email, password } })
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

  // --- Erreurs JSON cohérentes ---

  let r = await req('/api/auth/login', { method: 'POST', rawBody: '{pas du json' })
  check('JSON malformé → 400 BAD_JSON', r.status === 400 && r.data?.error?.code === 'BAD_JSON')

  r = await req('/api/nexiste/pas')
  check('route API inconnue → 404 JSON', r.status === 404 && r.data?.error?.code === 'NOT_FOUND')

  // --- Plafonds de longueur ---

  const admin = await login('admin@auctionlens.local', 'admin123!')
  const cab = (
    await req('/api/admin/cabinets', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        name: 'Test EPIC8',
        contact_email: `epic8-${stamp}@test.local`,
        plan_id: 1,
        user_email: `epic8-${stamp}@user.local`,
        user_password: 'provisoire1!',
      },
    })
  ).data
  const a = await login(`epic8-${stamp}@user.local`, 'provisoire1!')

  r = await req('/api/admin/cabinets', {
    method: 'POST',
    cookie: admin.cookie,
    body: { name: 'x'.repeat(201), contact_email: 'a@b.co', plan_id: 1, user_email: 'c@d.co', user_password: 'motdepasse' },
  })
  check('nom de cabinet > 200 → 400 TOO_LONG', r.status === 400 && r.data?.error?.code === 'TOO_LONG')

  r = await req('/api/studio/sales', {
    method: 'POST',
    cookie: a.cookie,
    body: { title: 'x'.repeat(201) },
  })
  check('titre de vente > 200 → 400 TOO_LONG', r.status === 400 && r.data?.error?.code === 'TOO_LONG')

  const sale = (
    await req('/api/studio/sales', { method: 'POST', cookie: a.cookie, body: { title: `Durcissement ${stamp}` } })
  ).data
  r = await req(`/api/studio/sales/${sale.id}/lots`, {
    method: 'POST',
    cookie: a.cookie,
    body: { lot_number: 'x'.repeat(21), title: 'Lot' },
  })
  check('numéro de lot > 20 → 400 TOO_LONG', r.status === 400 && r.data?.error?.code === 'TOO_LONG')

  const lot = (
    await req(`/api/studio/sales/${sale.id}/lots`, {
      method: 'POST',
      cookie: a.cookie,
      body: { lot_number: '1', title: 'Lot test' },
    })
  ).data
  r = await req(`/api/studio/lots/${lot.id}/resources`, {
    method: 'POST',
    cookie: a.cookie,
    body: { type: 'text', title: 'Expertise', body: 'x'.repeat(20001) },
  })
  check('contenu texte > 20000 → 400 TOO_LONG', r.status === 400 && r.data?.error?.code === 'TOO_LONG')

  // --- Rate limiting du login (5 échecs / 15 min par couple IP + email) ---

  const target = `ratelimit-${stamp}@test.local`
  let last
  for (let i = 0; i < 5; i++) {
    last = await login(target, 'mauvais-mot-de-passe')
  }
  check('5 premiers échecs → 401 classique', last.status === 401)
  last = await login(target, 'mauvais-mot-de-passe')
  check('6e tentative → 429 TOO_MANY_ATTEMPTS', last.status === 429 && last.data?.error?.code === 'TOO_MANY_ATTEMPTS')
  last = await login(target, 'meme-avec-un-autre-mdp')
  check('le blocage persiste pour cet email', last.status === 429)

  // Le blocage est ciblé : les autres comptes ne sont pas affectés
  last = await login('admin@auctionlens.local', 'admin123!')
  check('autre compte non affecté par le blocage', last.status === 200)

  console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} échec(s).`)
} finally {
  server.kill()
  const { default: db } = await import('../src/db/index.js')
  db.prepare("DELETE FROM cabinets WHERE contact_email LIKE 'epic8-%@test.local'").run()
}
process.exit(failures === 0 ? 0 : 1)
