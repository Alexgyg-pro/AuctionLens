import { createContext, useContext, useEffect, useState } from 'react'
import { api, ApiError } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // session = { user: {id, email, role}, cabinet: {...}|null } ou null si non connecté
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/auth/me')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } })
    setSession(data)
    return data
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
    }
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
