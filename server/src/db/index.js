import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../data')
const DB_PATH = path.join(DATA_DIR, 'auctionlens.db')
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
  )

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const markApplied = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)')

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      markApplied.run(file)
    })()
    console.log(`[db] migration appliquée : ${file}`)
  }
}

export default db
