import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export default function Home() {
  const [apiStatus, setApiStatus] = useState('vérification…')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setApiStatus(data.status === 'ok' ? 'connectée ✓' : 'réponse inattendue'))
      .catch(() => setApiStatus('injoignable ✗'))
  }, [])

  return (
    <main className="page">
      <h1>AuctionLens</h1>
      <p>La couche numérique des ventes aux enchères.</p>
      <p>
        API : <strong>{apiStatus}</strong>
      </p>
      <nav>
        <ul>
          <li>
            <Link to="/admin">Espace administration</Link>
          </li>
          <li>
            <Link to="/studio">Studio cabinet</Link>
          </li>
        </ul>
      </nav>
    </main>
  )
}
