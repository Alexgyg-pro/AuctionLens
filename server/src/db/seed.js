import bcrypt from 'bcryptjs'
import db, { runMigrations } from './index.js'

// Identifiants de développement — documentés dans le README racine.
const ADMIN_EMAIL = 'admin@auctionlens.local'
const ADMIN_PASSWORD = 'admin123!'
const CABINET_EMAIL = 'cabinet@auctionlens.local'
const CABINET_PASSWORD = 'cabinet123!'

const PLANS = [
  { name: 'Essentiel', max_active_sales: 1, max_lots_per_sale: 50, max_storage_mb: 500, price_monthly: 49 },
  { name: 'Pro', max_active_sales: 5, max_lots_per_sale: 300, max_storage_mb: 5000, price_monthly: 149 },
]

export function seed() {
  runMigrations()

  const insertPlan = db.prepare(`
    INSERT INTO plans (name, max_active_sales, max_lots_per_sale, max_storage_mb, price_monthly)
    VALUES (@name, @max_active_sales, @max_lots_per_sale, @max_storage_mb, @price_monthly)
    ON CONFLICT(name) DO NOTHING
  `)
  for (const plan of PLANS) {
    insertPlan.run(plan)
  }

  const adminExists = db
    .prepare("SELECT 1 FROM users WHERE email = ? AND role = 'admin'")
    .get(ADMIN_EMAIL)
  if (!adminExists) {
    db.prepare(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')"
    ).run(ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASSWORD, 10))
    console.log(`[seed] admin créé : ${ADMIN_EMAIL}`)
  }

  const cabinetUserExists = db
    .prepare('SELECT 1 FROM users WHERE email = ?')
    .get(CABINET_EMAIL)
  if (!cabinetUserExists) {
    const planId = db.prepare("SELECT id FROM plans WHERE name = 'Essentiel'").get().id
    const { lastInsertRowid: cabinetId } = db
      .prepare(
        `INSERT INTO cabinets (name, contact_email, plan_id, subscription_status, subscription_expires_at)
         VALUES (?, ?, ?, 'active', date('now', '+1 year'))`
      )
      .run('Cabinet Démo', CABINET_EMAIL, planId)
    db.prepare(
      "INSERT INTO users (email, password_hash, role, cabinet_id) VALUES (?, ?, 'cabinet', ?)"
    ).run(CABINET_EMAIL, bcrypt.hashSync(CABINET_PASSWORD, 10), cabinetId)
    console.log(`[seed] cabinet de démo créé : ${CABINET_EMAIL}`)
  }

  console.log('[seed] terminé')
}

seed()
