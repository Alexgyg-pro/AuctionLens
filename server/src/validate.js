// Garde-fou commun : plafonds de longueur des champs texte.
// Renvoie la réponse 400 si un champ dépasse, null sinon — à utiliser ainsi :
//   const tooLong = lengthError(res, [['Titre', title, 200]])
//   if (tooLong) return tooLong

export function lengthError(res, entries) {
  for (const [label, value, max] of entries) {
    if (typeof value === 'string' && value.length > max) {
      return res.status(400).json({
        error: { code: 'TOO_LONG', message: `${label} : ${max} caractères maximum` },
      })
    }
  }
  return null
}
