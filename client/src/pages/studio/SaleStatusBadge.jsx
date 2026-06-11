const LABELS = {
  draft: ['Brouillon', 'badge-draft'],
  published: ['Publiée', 'badge-active'],
  archived: ['Archivée', 'badge-archived'],
}

export default function SaleStatusBadge({ status }) {
  const [label, className] = LABELS[status] ?? [status, '']
  return <span className={`badge ${className}`}>{label}</span>
}
