import express from 'express'
import session from 'express-session'
import BetterSqlite3SessionStore from 'better-sqlite3-session-store'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import db from './db/index.js'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import studioRouter from './routes/studio.js'
import mediaRouter from './routes/media.js'
import { requireAdmin, requireCabinet } from './middleware/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.resolve(__dirname, '../uploads')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const SqliteStore = BetterSqlite3SessionStore(session)

const app = express()

app.use(express.json())
app.use(
  session({
    store: new SqliteStore({
      client: db,
      expired: { clear: true, intervalMs: 15 * 60 * 1000 },
    }),
    name: 'auctionlens.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-a-changer-en-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 h : une journée de travail au studio
    },
  })
)

app.use('/uploads', express.static(UPLOADS_DIR))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRouter)

// Espaces protégés : tout /api/admin/* ou /api/studio/* exige le bon rôle,
// y compris les routes futures.
app.use('/api/admin', requireAdmin, adminRouter)
app.use('/api/studio', requireCabinet, studioRouter)
app.use('/api/studio', requireCabinet, mediaRouter)

// 404 JSON pour toute route API inconnue
app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } })
})

export default app
