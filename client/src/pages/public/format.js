// Formats d'affichage partagés par les pages publiques.

const euro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function formatEstimate(low, high) {
  if (low == null && high == null) return null
  if (low != null && high != null) return `${euro.format(low)} – ${euro.format(high)}`
  return euro.format(low ?? high)
}

export function formatDate(isoDate) {
  if (!isoDate) return null
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
