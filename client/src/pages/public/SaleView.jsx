import { useParams } from 'react-router-dom'

export default function SaleView() {
  const { saleSlug } = useParams()

  return (
    <main className="page">
      <h1>Vente : {saleSlug}</h1>
      <p>Consultation publique de la vente — à venir (EPIC 6).</p>
    </main>
  )
}
