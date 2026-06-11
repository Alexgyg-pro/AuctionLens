// Vérification des conditions d'acceptation de l'EPIC 6 contre le serveur réel.
// Couvre aussi les CA en attente des EPICs 3 et 4 : vente archivée → 404 public,
// cabinet suspendu → 404 public, réactivation → tout refonctionne.
// Usage : node scripts/check-public.mjs (démarre le serveur lui-même sur le port 3100)
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePng, makePdf, uploadForm } from './test-utils.mjs'

const PORT = 3100
const BASE = `http://localhost:${PORT}`
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_ROOT = path.resolve(__dirname, '../uploads')

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

const cabinetIds = []

try {
  await waitForServer()
  const admin = await login('admin@auctionlens.local', 'admin123!')

  // Mise en place : 1 cabinet, 1 vente, 2 lots, image active, ressources variées
  const cab = (
    await req('/api/admin/cabinets', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        name: 'Test EPIC6',
        contact_email: `epic6-${stamp}@test.local`,
        plan_id: 1,
        user_email: `epic6-${stamp}@user.local`,
        user_password: 'provisoire1!',
      },
    })
  ).data
  cabinetIds.push(cab.id)
  const a = await login(`epic6-${stamp}@user.local`, 'provisoire1!')

  const sale = (
    await req('/api/studio/sales', {
      method: 'POST',
      cookie: a.cookie,
      body: {
        title: `Vente publique ${stamp}`,
        description: 'Tableaux et objets d’art',
        event_date: '2026-07-04',
        location: 'Hôtel des ventes, Lyon',
      },
    })
  ).data

  const mkLot = async (body) =>
    (await req(`/api/studio/sales/${sale.id}/lots`, { method: 'POST', cookie: a.cookie, body })).data
  // sort_order inversé pour vérifier que la liste publique respecte l'ordre catalogue
  const lot2 = await mkLot({ lot_number: '2', title: 'Commode Louis XV', sort_order: 1 })
  const lot1 = await mkLot({
    lot_number: '1',
    title: 'Paire de candélabres',
    artist: 'Attribué à Thomire',
    description: 'Bronze doré, vers 1810.',
    estimate_low: 2000,
    estimate_high: 3000,
    sort_order: 0,
  })

  await req(`/api/studio/lots/${lot1.id}/image-references`, {
    method: 'POST',
    cookie: a.cookie,
    form: uploadForm(makePng(300, 300), { fields: { label: 'vue de face' } }),
  })

  const mkRes = (body) =>
    req(`/api/studio/lots/${lot1.id}/resources`, { method: 'POST', cookie: a.cookie, body })
  const textRes = (await mkRes({ type: 'text', title: 'Expertise', body: 'Paire authentifiée.\nÉtat remarquable.' })).data
  const linkRes = (await mkRes({ type: 'link', title: 'Article', body: 'https://presse.example/candelabres' })).data
  const pdfRes = (
    await req(`/api/studio/lots/${lot1.id}/resources`, {
      method: 'POST',
      cookie: a.cookie,
      form: uploadForm(makePdf(), {
        type: 'application/pdf',
        name: 'rapport.pdf',
        fields: { type: 'pdf', title: 'Rapport' },
      }),
    })
  ).data

  // US-6.1 — vente non publiée : 404 public (et lot aussi)
  let r = await req(`/api/public/sales/${sale.slug}`)
  check('vente draft → 404 public', r.status === 404)
  r = await req(`/api/public/lots/${lot1.id}`)
  check('lot d’une vente draft → 404 public', r.status === 404)

  await req(`/api/studio/sales/${sale.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'published' },
  })

  // US-6.1 — vente publiée accessible sans aucune authentification
  r = await req(`/api/public/sales/${sale.slug}`)
  check('vente publiée → 200 anonyme', r.status === 200)
  check(
    'en-tête : titre, cabinet, date, lieu',
    r.data?.title === sale.title &&
      r.data?.cabinet_name === 'Test EPIC6' &&
      r.data?.event_date === '2026-07-04' &&
      r.data?.location === 'Hôtel des ventes, Lyon'
  )
  check('liste ordonnée des lots (ordre catalogue)', r.data?.lots?.[0]?.id === lot1.id && r.data?.lots?.[1]?.id === lot2.id)
  check(
    'lot résumé : numéro, titre, artiste, estimation',
    r.data?.lots?.[0]?.lot_number === '1' &&
      r.data?.lots?.[0]?.artist === 'Attribué à Thomire' &&
      r.data?.lots?.[0]?.estimate_high === 3000
  )
  check('compteur de contenus enrichis', r.data?.lots?.[0]?.resource_count === 3)
  check('pas de données internes exposées (cabinet_id, statut)', r.data?.cabinet_id === undefined && r.data?.status === undefined)

  // US-6.2 — fiche lot complète, ressources dans l'ordre du cabinet
  r = await req(`/api/public/lots/${lot1.id}`)
  check('fiche lot publique → 200', r.status === 200 && r.data?.description === 'Bronze doré, vers 1810.')
  check('retour vers la vente (slug + titre)', r.data?.sale_slug === sale.slug && r.data?.sale_title === sale.title)
  check(
    'ressources triées par sort_order',
    r.data?.resources?.map((x) => x.id).join(',') === [textRes.id, linkRes.id, pdfRes.id].join(',')
  )
  check(
    'types et contenus présents (texte, lien, pdf)',
    r.data?.resources?.[0]?.body?.includes('authentifiée') &&
      r.data?.resources?.[1]?.body === 'https://presse.example/candelabres' &&
      r.data?.resources?.[2]?.file_path?.endsWith('.pdf')
  )

  // Slug inconnu → 404 propre
  r = await req(`/api/public/sales/nexiste-pas-${stamp}`)
  check('slug inconnu → 404', r.status === 404)

  // US-4.2 (dernière CA) — vente archivée → 404 public
  await req(`/api/studio/sales/${sale.id}/status`, { method: 'PUT', cookie: a.cookie, body: { status: 'archived' } })
  r = await req(`/api/public/sales/${sale.slug}`)
  check('vente archivée → 404 public', r.status === 404)
  r = await req(`/api/public/lots/${lot1.id}`)
  check('lot d’une vente archivée → 404 public', r.status === 404)

  await req(`/api/studio/sales/${sale.id}/status`, { method: 'PUT', cookie: a.cookie, body: { status: 'published' } })
  r = await req(`/api/public/sales/${sale.slug}`)
  check('republication → 200 public', r.status === 200)

  // US-3.3 (CA en attente) — cabinet suspendu → 404 public, réactivé → 200
  await req(`/api/admin/cabinets/${cab.id}/subscription`, {
    method: 'PUT',
    cookie: admin.cookie,
    body: { status: 'suspended' },
  })
  r = await req(`/api/public/sales/${sale.slug}`)
  check('cabinet suspendu → vente publiée 404 public', r.status === 404)
  r = await req(`/api/public/lots/${lot1.id}`)
  check('cabinet suspendu → lot 404 public', r.status === 404)

  await req(`/api/admin/cabinets/${cab.id}/subscription`, {
    method: 'PUT',
    cookie: admin.cookie,
    body: { status: 'active' },
  })
  r = await req(`/api/public/sales/${sale.slug}`)
  check('cabinet réactivé → vente de nouveau visible', r.status === 200)

  console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} échec(s).`)
} finally {
  server.kill()
  const { default: db } = await import('../src/db/index.js')
  db.prepare("DELETE FROM cabinets WHERE contact_email LIKE 'epic6-%@test.local'").run()
  for (const id of cabinetIds) {
    fs.rmSync(path.join(UPLOADS_ROOT, String(id)), { recursive: true, force: true })
  }
}
process.exit(failures === 0 ? 0 : 1)
