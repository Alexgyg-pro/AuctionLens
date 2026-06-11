// États transverses des pages publiques : chargement et vente indisponible.
// Le 404 est volontairement neutre : on ne dit pas si la vente a existé.

export function PublicLoading() {
  return (
    <main className="public-page">
      <p className="public-muted">Chargement…</p>
    </main>
  )
}

export function PublicNotFound() {
  return (
    <main className="public-page public-notfound">
      <h1>Vente introuvable</h1>
      <p className="public-muted">
        Cette vente n'est pas disponible. Elle a peut-être été clôturée par le
        cabinet, ou l'adresse est incorrecte.
      </p>
    </main>
  )
}
