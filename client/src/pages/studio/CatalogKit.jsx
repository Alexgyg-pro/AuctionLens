import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Kit catalogue : le QR de la vente et l'icône « scannable », à remettre au
// maquettiste du catalogue papier. Proposé uniquement après la première
// publication, quand le slug est figé.

function triggerDownload(href, filename) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const ICON_SRC = '/kit/scannable-icon.svg'

export default function CatalogKit({ slug }) {
  const publicUrl = `${window.location.origin}/v/${slug}`
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    QRCode.toDataURL(publicUrl, { width: 160, margin: 2 })
      .then(setPreview)
      .catch((e) => setError(e.message))
  }, [publicUrl])

  async function downloadQrPng() {
    // 1024 px ≈ 8,5 cm à 300 dpi : suffisant pour l'impression catalogue.
    const dataUrl = await QRCode.toDataURL(publicUrl, {
      width: 1024,
      margin: 4,
      errorCorrectionLevel: 'M',
    })
    triggerDownload(dataUrl, `qr-${slug}.png`)
  }

  async function downloadQrSvg() {
    const svg = await QRCode.toString(publicUrl, { type: 'svg', margin: 4 })
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    triggerDownload(url, `qr-${slug}.svg`)
    URL.revokeObjectURL(url)
  }

  function downloadIconSvg() {
    triggerDownload(ICON_SRC, 'icone-scannable.svg')
  }

  async function downloadIconPng() {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error("Impossible de charger l'icône"))
      img.src = ICON_SRC
    })
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    canvas.getContext('2d').drawImage(img, 0, 0, 512, 512)
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      triggerDownload(url, 'icone-scannable.png')
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <section>
      <h2>Kit catalogue</h2>
      <p className="quotas">
        Consigne d'usage : placez le <strong>QR code</strong> sur la page
        d'informations pratiques du catalogue (dates, adresses…) — il ouvre la
        vente en ligne. Placez la petite <strong>icône « scannable »</strong> à
        côté de chaque image dont le lot porte une image de référence active :
        elle signale à l'acheteur que l'image peut être scannée.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="kit-row">
        <div className="kit-item">
          {preview && <img src={preview} alt={`QR code vers ${publicUrl}`} width="120" height="120" />}
          <p>
            QR de la vente
            <br />
            <code>{publicUrl}</code>
          </p>
          <div className="row-actions">
            <button type="button" onClick={downloadQrPng}>
              PNG (impression)
            </button>
            <button type="button" onClick={downloadQrSvg}>
              SVG (vectoriel)
            </button>
          </div>
        </div>
        <div className="kit-item">
          <img src={ICON_SRC} alt="Icône image scannable" width="48" height="48" />
          <p>Icône « scannable »</p>
          <div className="row-actions">
            <button type="button" onClick={downloadIconPng}>
              PNG
            </button>
            <button type="button" onClick={downloadIconSvg}>
              SVG (vectoriel)
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
