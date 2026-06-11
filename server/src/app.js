import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.resolve(__dirname, '../uploads')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const app = express()

app.use(express.json())
app.use('/uploads', express.static(UPLOADS_DIR))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// 404 JSON pour toute route API inconnue
app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } })
})

export default app
