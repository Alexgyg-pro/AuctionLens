// Vérification des conditions d'acceptation de l'EPIC 4 contre le serveur réel.
// Usage : node scripts/check-studio.mjs (démarre le serveur lui-même sur le port 3100)
import { spawn } from 'node:child_process'
import { makePng, uploadForm } from './test-utils.mjs'

const PORT = 3100
const BASE = `http://localhost:${PORT}`

const server = spawn('node', ['src/server.js'], {
  env: { ...process.env, PORT },
  stdio: 'ignore',
})

let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures++
}

async function req(path, { method = 'GET', body, cookie, form } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: form ?? (body ? JSON.stringify(body) : undefined),
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

const stamp = Date.now()

try {
  await waitForServer()

  // Mise en place : 2 cabinets de test (plan Essentiel : 1 vente active, 50 lots/vente)
  const admin = await login('admin@auctionlens.local', 'admin123!')
  const mk = async (n) =>
    (
      await req('/api/admin/cabinets', {
        method: 'POST',
        cookie: admin.cookie,
        body: {
          name: `Test EPIC4 ${n}`,
          contact_email: `epic4-${n}@test.local`,
          plan_id: 1,
          user_email: `epic4-user${n}-${stamp}@test.local`,
          user_password: 'provisoire1!',
        },
      })
    ).data
  const cabA = await mk('A')
  const cabB = await mk('B')
  const a = await login(`epic4-userA-${stamp}@test.local`, 'provisoire1!')
  const b = await login(`epic4-userB-${stamp}@test.local`, 'provisoire1!')

  // US-4.1 — création en brouillon, slug généré
  let r = await req('/api/studio/sales', {
    method: 'POST',
    cookie: a.cookie,
    body: { title: 'Tableaux anciens — juin 2026', event_date: '2026-06-28', location: 'Drouot' },
  })
  const sale = r.data
  check('création vente → 201, statut draft', r.status === 201 && sale?.status === 'draft')
  check('slug lisible généré', sale?.slug === 'tableaux-anciens-juin-2026', sale?.slug)

  // Collision de slug → suffixe
  r = await req('/api/studio/sales', {
    method: 'POST',
    cookie: a.cookie,
    body: { title: 'Tableaux anciens — juin 2026' },
  })
  const sale2 = r.data
  check('collision de slug → suffixe', sale2?.slug === 'tableaux-anciens-juin-2026-2', sale2?.slug)

  // US-4.2 — publication refusée sans lot
  r = await req(`/api/studio/sales/${sale.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'published' },
  })
  check('publication sans lot refusée + message', r.status === 400 && /au moins un lot/.test(r.data?.error?.message ?? ''))

  // US-4.3 — lots : création, numéro unique par vente
  r = await req(`/api/studio/sales/${sale.id}/lots`, {
    method: 'POST',
    cookie: a.cookie,
    body: { lot_number: '12', title: 'Nature morte', artist: 'École flamande', estimate_low: 800, estimate_high: 1200 },
  })
  const lot = r.data
  check('création lot → 201', r.status === 201 && lot?.lot_number === '12')

  r = await req(`/api/studio/sales/${sale.id}/lots`, {
    method: 'POST',
    cookie: a.cookie,
    body: { lot_number: '12', title: 'Doublon' },
  })
  check('numéro de lot dupliqué → 409', r.status === 409)

  r = await req(`/api/studio/sales/${sale2.id}/lots`, {
    method: 'POST',
    cookie: a.cookie,
    body: { lot_number: '12', title: 'Même numéro, autre vente' },
  })
  check('même numéro dans une autre vente → autorisé', r.status === 201)
  const lotSale2 = r.data

  // Depuis l'EPIC 5, publier exige au moins une image de référence active.
  for (const targetLot of [lot, lotSale2]) {
    await req(`/api/studio/lots/${targetLot.id}/image-references`, {
      method: 'POST',
      cookie: a.cookie,
      form: uploadForm(makePng(300, 300), { fields: { label: 'vue test' } }),
    })
  }

  // Slug : suit le titre en brouillon, figé après publication
  r = await req(`/api/studio/sales/${sale.id}`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { title: 'Maîtres anciens — juin 2026' },
  })
  check('brouillon : le slug suit le titre', r.data?.slug === 'maitres-anciens-juin-2026', r.data?.slug)

  r = await req(`/api/studio/sales/${sale.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'published' },
  })
  check('publication avec ≥1 lot → 200 + published_at', r.status === 200 && !!r.data?.published_at)

  r = await req(`/api/studio/sales/${sale.id}`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { title: 'Titre encore modifié après publication' },
  })
  check('publiée : le slug est figé', r.data?.slug === 'maitres-anciens-juin-2026', r.data?.slug)

  // US-4.2 — transitions
  r = await req(`/api/studio/sales/${sale.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'draft' },
  })
  check('published → draft interdit', r.status === 400)

  // Quota max_active_sales (Essentiel = 1) : publier la 2e vente → refus
  r = await req(`/api/studio/sales/${sale2.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'published' },
  })
  check('quota ventes actives → 403 + nom du plan', r.status === 403 && /Essentiel/.test(r.data?.error?.message ?? ''))

  // Archiver puis republier
  r = await req(`/api/studio/sales/${sale.id}/status`, { method: 'PUT', cookie: a.cookie, body: { status: 'archived' } })
  check('published → archived', r.status === 200)
  r = await req(`/api/studio/sales/${sale.id}/status`, { method: 'PUT', cookie: a.cookie, body: { status: 'published' } })
  check('archived → published (quota libéré)', r.status === 200)

  // Suppression : refusée si publiée, ok en brouillon
  r = await req(`/api/studio/sales/${sale.id}`, { method: 'DELETE', cookie: a.cookie })
  check('suppression vente publiée refusée', r.status === 403)
  r = await req(`/api/studio/sales/${sale2.id}`, { method: 'DELETE', cookie: a.cookie })
  check('suppression brouillon (et ses lots en cascade)', r.status === 200)

  // US-2.3 (case en attente) — cloisonnement : B ne voit pas les données de A
  r = await req(`/api/studio/sales/${sale.id}`, { cookie: b.cookie })
  check('cloisonnement : vente de A invisible pour B → 404', r.status === 404)
  r = await req(`/api/studio/lots/${lot.id}`, { cookie: b.cookie })
  check('cloisonnement : lot de A invisible pour B → 404', r.status === 404)
  r = await req(`/api/studio/lots/${lot.id}`, { method: 'DELETE', cookie: b.cookie })
  check('cloisonnement : B ne peut pas supprimer le lot de A', r.status === 404)

  // Quota max_lots_per_sale (Essentiel = 50) : remplir puis dépasser
  const fill = await req('/api/studio/sales', {
    method: 'POST',
    cookie: b.cookie,
    body: { title: `Quota lots ${stamp}` },
  })
  let quotaHit = null
  for (let i = 1; i <= 51; i++) {
    quotaHit = await req(`/api/studio/sales/${fill.data.id}/lots`, {
      method: 'POST',
      cookie: b.cookie,
      body: { lot_number: String(i), title: `Lot ${i}` },
    })
    if (quotaHit.status !== 201) break
  }
  check('quota lots/vente : 51e lot refusé → 403 + plan', quotaHit.status === 403 && /50 lots/.test(quotaHit.data?.error?.message ?? ''))

  // Les compteurs admin sont devenus réels (EPIC 3 → EPIC 4)
  r = await req(`/api/admin/cabinets/${cabB.id}`, { cookie: admin.cookie })
  check('compteurs admin réels : 50 lots comptés', r.data?.usage?.total_lots === 50, String(r.data?.usage?.total_lots))

  console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} échec(s).`)
} finally {
  server.kill()
  const { default: db } = await import('../src/db/index.js')
  const testCabinets = db
    .prepare("SELECT id FROM cabinets WHERE contact_email LIKE 'epic4-%@test.local'")
    .all()
  db.prepare("DELETE FROM cabinets WHERE contact_email LIKE 'epic4-%@test.local'").run()
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const uploadsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
  for (const { id } of testCabinets) {
    fs.rmSync(path.join(uploadsRoot, String(id)), { recursive: true, force: true })
  }
}
process.exit(failures === 0 ? 0 : 1)
