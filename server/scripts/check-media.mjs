// Vérification des conditions d'acceptation de l'EPIC 5 contre le serveur réel.
// Usage : node scripts/check-media.mjs (démarre le serveur lui-même sur le port 3100)
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

// Plan à quota de stockage minuscule (1 Mo) pour tester le blocage sans
// uploader des centaines de Mo.
const { default: db } = await import('../src/db/index.js')
const { runMigrations } = await import('../src/db/index.js')
runMigrations()
const miniPlanId = db
  .prepare(
    `INSERT INTO plans (name, max_active_sales, max_lots_per_sale, max_storage_mb, price_monthly)
     VALUES (?, 5, 100, 1, 0)`
  )
  .run(`TestMini-${stamp}`).lastInsertRowid

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

  const mkCabinet = async (label, planId) => {
    const r = await req('/api/admin/cabinets', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        name: `Test EPIC5 ${label}`,
        contact_email: `epic5-${label}-${stamp}@test.local`,
        plan_id: planId,
        user_email: `epic5-${label}-${stamp}@user.local`,
        user_password: 'provisoire1!',
      },
    })
    cabinetIds.push(r.data.id)
    const session = await login(`epic5-${label}-${stamp}@user.local`, 'provisoire1!')
    return { id: r.data.id, cookie: session.cookie }
  }

  const a = await mkCabinet('A', 1)
  const mini = await mkCabinet('M', miniPlanId)

  const sale = (
    await req('/api/studio/sales', { method: 'POST', cookie: a.cookie, body: { title: `Vente médias ${stamp}` } })
  ).data
  const lot = (
    await req(`/api/studio/sales/${sale.id}/lots`, {
      method: 'POST',
      cookie: a.cookie,
      body: { lot_number: '1', title: 'Bronze de Barye' },
    })
  ).data

  // US-4.2 (renforcée) — publication refusée sans image active
  let r = await req(`/api/studio/sales/${sale.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'published' },
  })
  check('publication sans image active refusée', r.status === 400 && /image de référence active/.test(r.data?.error?.message ?? ''))

  // US-5.1 — upload conforme
  r = await req(`/api/studio/lots/${lot.id}/image-references`, {
    cookie: a.cookie,
    method: 'POST',
    form: uploadForm(makePng(300, 300), { fields: { label: 'vue de face' } }),
  })
  const ref1 = r.data
  check('upload image référence → 201 + dimensions', r.status === 201 && ref1?.width === 300 && ref1?.label === 'vue de face')

  const fileRes = await fetch(`${BASE}/uploads/${ref1.file_path}`)
  check('fichier servi via /uploads', fileRes.status === 200)
  check('nom de fichier aléatoire (UUID)', /^[0-9a-f-]{36}\.png$/.test(ref1.file_path.split('/')[1] ?? ''))

  // Image trop petite → message expliquant l'exigence
  r = await req(`/api/studio/lots/${lot.id}/image-references`, {
    cookie: a.cookie,
    method: 'POST',
    form: uploadForm(makePng(100, 100)),
  })
  check('image < 224×224 refusée + message', r.status === 400 && /224/.test(r.data?.error?.message ?? ''))

  // Mauvais type de fichier
  r = await req(`/api/studio/lots/${lot.id}/image-references`, {
    cookie: a.cookie,
    method: 'POST',
    form: uploadForm(Buffer.from('pas une image'), { type: 'text/plain', name: 'x.txt' }),
  })
  check('type de fichier refusé', r.status === 400)

  // Deuxième image pour le même lot (relation n→1)
  r = await req(`/api/studio/lots/${lot.id}/image-references`, {
    cookie: a.cookie,
    method: 'POST',
    form: uploadForm(makePng(400, 250), { fields: { label: 'détail signature' } }),
  })
  const ref2 = r.data
  check('plusieurs images pour un même lot', r.status === 201)

  r = await req(`/api/studio/lots/${lot.id}`, { cookie: a.cookie })
  check('GET lot : 2 images listées', r.data?.images?.length === 2)

  // Désactivation sans suppression → hors reconnaissance
  r = await req(`/api/studio/image-references/${ref1.id}`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { is_active: false },
  })
  check('désactivation is_active', r.status === 200 && r.data?.is_active === 0)

  r = await req(`/api/studio/image-references/${ref2.id}`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { is_active: false },
  })
  // Avec 2 images inactives, publication toujours refusée
  r = await req(`/api/studio/sales/${sale.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'published' },
  })
  check('images toutes inactives → publication refusée', r.status === 400)

  await req(`/api/studio/image-references/${ref2.id}`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { is_active: true },
  })
  r = await req(`/api/studio/sales/${sale.id}/status`, {
    method: 'PUT',
    cookie: a.cookie,
    body: { status: 'published' },
  })
  check('1 image réactivée → publication OK', r.status === 200)

  // US-5.2 — ressources de tous types
  const mkRes = (body) =>
    req(`/api/studio/lots/${lot.id}/resources`, { method: 'POST', cookie: a.cookie, body })

  r = await mkRes({ type: 'text', title: 'Expertise', body: 'Bronze authentifié par…' })
  const textRes = r.data
  check('ressource texte → 201', r.status === 201 && textRes?.sort_order === 0)

  r = await mkRes({ type: 'link', title: 'Article', body: 'pas-une-url' })
  check('lien invalide refusé', r.status === 400)

  r = await mkRes({ type: 'link', title: 'Article de presse', body: 'https://presse.example/article' })
  const linkRes = r.data
  check('ressource lien → 201, ordre suivant', r.status === 201 && linkRes?.sort_order === 1)

  r = await req(`/api/studio/lots/${lot.id}/resources`, {
    method: 'POST',
    cookie: a.cookie,
    form: uploadForm(makePdf(), {
      type: 'application/pdf',
      name: 'rapport.pdf',
      fields: { type: 'pdf', title: 'Rapport d’authentification' },
    }),
  })
  const pdfRes = r.data
  check('ressource PDF uploadée → 201', r.status === 201 && pdfRes?.mime_type === 'application/pdf')

  // Réordonnancement (échange des positions, comme le fait l'UI) + édition de titre
  await req(`/api/studio/resources/${pdfRes.id}`, { method: 'PUT', cookie: a.cookie, body: { sort_order: textRes.sort_order } })
  await req(`/api/studio/resources/${textRes.id}`, { method: 'PUT', cookie: a.cookie, body: { sort_order: pdfRes.sort_order } })
  await req(`/api/studio/resources/${linkRes.id}`, { method: 'PUT', cookie: a.cookie, body: { title: 'Presse — Gazette Drouot' } })
  r = await req(`/api/studio/lots/${lot.id}/resources`, { cookie: a.cookie })
  check('réordonnancement appliqué', r.data?.[0]?.id === pdfRes.id)
  check('titre modifié', r.data?.some((x) => x.title === 'Presse — Gazette Drouot'))

  // Cloisonnement : le cabinet M ne touche pas aux médias de A
  r = await req(`/api/studio/image-references/${ref2.id}`, { method: 'PUT', cookie: mini.cookie, body: { is_active: false } })
  check('cloisonnement image ref → 404', r.status === 404)
  r = await req(`/api/studio/resources/${pdfRes.id}`, { method: 'DELETE', cookie: mini.cookie })
  check('cloisonnement ressource → 404', r.status === 404)

  // US-5.3 — quota de stockage (plan mini : 1 Mo)
  const miniSale = (
    await req('/api/studio/sales', { method: 'POST', cookie: mini.cookie, body: { title: `Quota stockage ${stamp}` } })
  ).data
  const miniLot = (
    await req(`/api/studio/sales/${miniSale.id}/lots`, {
      method: 'POST',
      cookie: mini.cookie,
      body: { lot_number: '1', title: 'Lot test quota' },
    })
  ).data

  const bigPng = makePng(500, 500, { noise: true }) // ~750 Ko incompressible
  r = await req(`/api/studio/lots/${miniLot.id}/resources`, {
    method: 'POST',
    cookie: mini.cookie,
    form: uploadForm(bigPng, { name: 'hd1.png', fields: { type: 'image_hd', title: 'HD 1' } }),
  })
  check('1er upload sous le quota → 201', r.status === 201, `status ${r.status}`)

  r = await req(`/api/studio/lots/${miniLot.id}/resources`, {
    method: 'POST',
    cookie: mini.cookie,
    form: uploadForm(bigPng, { name: 'hd2.png', fields: { type: 'image_hd', title: 'HD 2' } }),
  })
  check('2e upload dépasse 1 Mo → 403 + plan', r.status === 403 && /stockage/.test(r.data?.error?.message ?? ''))

  // Consommation visible côté studio
  r = await req('/api/studio/usage', { cookie: mini.cookie })
  check('usage studio : stockage consommé > 0', r.data?.usage?.storage_bytes > 700_000)

  // Cascade : suppression du lot → fichiers physiquement supprimés
  const refPath = path.join(UPLOADS_ROOT, ref2.file_path)
  const pdfPath = path.join(UPLOADS_ROOT, pdfRes.file_path)
  check('fichiers présents avant suppression', fs.existsSync(refPath) && fs.existsSync(pdfPath))
  r = await req(`/api/studio/lots/${lot.id}`, { method: 'DELETE', cookie: a.cookie })
  check('suppression lot → 200', r.status === 200)
  check('fichiers supprimés du disque (cascade)', !fs.existsSync(refPath) && !fs.existsSync(pdfPath))

  console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} échec(s).`)
} finally {
  server.kill()
  // Nettoyage : cabinets de test (cascade BDD), leurs dossiers d'upload, plan mini.
  db.prepare(`DELETE FROM cabinets WHERE contact_email LIKE 'epic5-%@test.local'`).run()
  db.prepare('DELETE FROM plans WHERE id = ?').run(miniPlanId)
  for (const id of cabinetIds) {
    fs.rmSync(path.join(UPLOADS_ROOT, String(id)), { recursive: true, force: true })
  }
}
process.exit(failures === 0 ? 0 : 1)
