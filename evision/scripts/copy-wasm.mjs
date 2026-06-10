// Copie les fichiers WASM de TF.js dans public/tfwasm/ pour que Vite puisse les servir.
import { cpSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src  = path.join(root, 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'wasm-out')
const dest = path.join(root, 'public', 'tfwasm')

if (!existsSync(src)) {
  console.warn('[copy-wasm] Source introuvable :', src)
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('[copy-wasm] Fichiers WASM copiés dans public/tfwasm/')
