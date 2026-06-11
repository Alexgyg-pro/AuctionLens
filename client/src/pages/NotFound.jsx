import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="page">
      <h1>Page introuvable</h1>
      <p>Cette page n'existe pas ou n'est plus disponible.</p>
      <Link to="/">Retour à l'accueil</Link>
    </main>
  )
}
