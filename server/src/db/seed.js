import bcrypt from 'bcryptjs'
import db, { runMigrations } from './index.js'

// Identifiants de développement — documentés dans le README racine.
const ADMIN_EMAIL = 'admin@auctionlens.local'
const ADMIN_PASSWORD = 'admin123!'

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

  console.log('[seed] terminé')
}

seed()
