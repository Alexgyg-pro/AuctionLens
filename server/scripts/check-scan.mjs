// Vérification des conditions d'acceptation de l'EPIC 7 (côté API) contre le
// serveur réel : manifeste de reconnaissance et calibration du seuil.
// Le scan caméra lui-même se vérifie en recette (navigateur + webcam).
// Usage : node scripts/check-scan.mjs (démarre le serveur lui-même sur le port 3100)
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePng, uploadForm } from './test-utils.mjs'

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

  const cab = (
    await req('/api/admin/cabinets', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        name: 'Test EPIC7',
        contact_email: `epic7-${stamp}@test.local`,
        plan_id: 1,
        user_email: `epic7-${stamp}@user.local`,
        user_password: 'provisoire1!',
      },
    })
  ).data
  cabinetIds.push(cab.id)
  const a = await login(`epic7-${stamp}@user.local`, 'provisoire1!')

  const sale = (
    await req('/api/studio/sales', {
      method: 'POST',
      cookie: a.cookie,
      body: { title: `Vente scan ${stamp}` },
    })
  ).data
  const mkLot = async (n, title) =>
    (
      await req(`/api/studio/sales/${sale.id}/lots`, {
        method: 'POST',
        cookie: a.cookie,
        body: { lot_number: n, title },
      })
    ).data
  const lot1 = await mkLot('1', 'Vase de Sèvres')
  const lot2 = await mkLot('2', 'Pendule Empire')

  // Lot 1 : deux vues (relation n→1) ; lot 2 : une vue
  const upload = async (lotId, label) =>
    (
      await req(`/api/studio/lots/${lotId}/image-references`, {
        method: 'POST',
        cookie: a.cookie,
        form: uploadForm(makePng(300, 300), { fields: { label } }),
      })
    ).data
  const ref1a = await upload(lot1.id, 'vue de face')
  const ref1b = await upload(lot1.id, 'détail signature')
  const ref2 = await upload(lot2.id, 'vue de face')

  // US-7.2 — manifeste indisponible avant publication
  let r = await req(`/api/public/sales/${sale.slug}/recognition-manifest`)
  check('manifeste avant publication → 404', r.status === 404)

  await req(`/api/studio/sales/${sale.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'published' },
  })

  // US-7.2 — manifeste : threshold + références actives avec mapping lotId
  r = await req(`/api/public/sales/${sale.slug}/recognition-manifest`)
  check('manifeste publié → 200 anonyme', r.status === 200)
  check('threshold par défaut 0.55', r.data?.threshold === 0.55, String(r.data?.threshold))
  check('3 références actives', r.data?.references?.length === 3)
  const byId = new Map((r.data?.references ?? []).map((x) => [x.id, x]))
  check(
    'id en chaîne (contrat eVision) + mapping lotId',
    byId.get(String(ref1a.id))?.lotId === lot1.id &&
      byId.get(String(ref1b.id))?.lotId === lot1.id &&
      byId.get(String(ref2.id))?.lotId === lot2.id
  )
  check(
    'src pointe vers /uploads/',
    (r.data?.references ?? []).every((x) => x.src.startsWith('/uploads/'))
  )
  const fileRes = await fetch(BASE + byId.get(String(ref1a.id)).src)
  check('fichier de référence servi (src valide)', fileRes.status === 200)

  // US-7.4 — image désactivée : sort du manifeste sans suppression
  await req(`/api/studio/image-references/${ref1b.id}`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { is_active: false },
  })
  r = await req(`/api/public/sales/${sale.slug}/recognition-manifest`)
  check(
    'image désactivée exclue du manifeste',
    r.data?.references?.length === 2 && !r.data.references.some((x) => x.id === String(ref1b.id))
  )

  // US-7.4 — calibration du seuil (plage 0.40–0.70)
  r = await req(`/api/studio/sales/${sale.id}`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { recognition_threshold: 0.5 },
  })
  check('seuil modifiable par le cabinet', r.status === 200 && r.data?.recognition_threshold === 0.5)
  r = await req(`/api/public/sales/${sale.slug}/recognition-manifest`)
  check('manifeste reflète le nouveau seuil', r.data?.threshold === 0.5)

  for (const bad of [0.39, 0.71, 'haut', null]) {
    r = await req(`/api/studio/sales/${sale.id}`, {
      method: 'PUT',
      cookie: a.cookie,
      body: { recognition_threshold: bad },
    })
    if (r.status !== 400) {
      check(`seuil invalide refusé (${JSON.stringify(bad)})`, false, `status ${r.status}`)
    }
  }
  check('seuils hors plage 0.40–0.70 refusés', true)

  // Visibilité : cabinet suspendu / vente archivée → manifeste 404
  await req(`/api/admin/cabinets/${cab.id}/subscription`, {
    method: 'PUT',
    cookie: admin.cookie,
    body: { status: 'suspended' },
  })
  r = await req(`/api/public/sales/${sale.slug}/recognition-manifest`)
  check('cabinet suspendu → manifeste 404', r.status === 404)
  await req(`/api/admin/cabinets/${cab.id}/subscription`, {
    method: 'PUT',
    cookie: admin.cookie,
    body: { status: 'active' },
  })

  await req(`/api/studio/sales/${sale.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'archived' },
  })
  r = await req(`/api/public/sales/${sale.slug}/recognition-manifest`)
  check('vente archivée → manifeste 404', r.status === 404)

  console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} échec(s).`)
} finally {
  server.kill()
  const { default: db } = await import('../src/db/index.js')
  db.prepare("DELETE FROM cabinets WHERE contact_email LIKE 'epic7-%@test.local'").run()
  for (const id of cabinetIds) {
    fs.rmSync(path.join(UPLOADS_ROOT, String(id)), { recursive: true, force: true })
  }
}
process.exit(failures === 0 ? 0 : 1)
