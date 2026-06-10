import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Exclure UNIQUEMENT le backend WASM dont le worker inline casse esbuild.
    // Les autres packages TF.js (y compris long.js CJS) sont optimisés normalement.
    exclude: ['@tensorflow/tfjs-backend-wasm'],
  },
})
