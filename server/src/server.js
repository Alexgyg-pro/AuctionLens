import app from './app.js'
import { runMigrations } from './db/index.js'

const PORT = process.env.PORT || 3000

runMigrations()

app.listen(PORT, () => {
  console.log(`[server] API AuctionLens sur http://localhost:${PORT}`)
})
