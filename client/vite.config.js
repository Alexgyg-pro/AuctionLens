import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Autorise l'accès via un tunnel ngrok (test du scan caméra sur smartphone) ;
    // sans cela, Vite bloque les requêtes dont l'hôte n'est pas localhost.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.dev'],
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
})
