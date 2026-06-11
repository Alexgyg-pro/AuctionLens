import zlib from 'node:zlib'

// Génère un vrai PNG RGB en mémoire (dégradé, ou bruit incompressible
// pour les tests de quota de stockage).
export function makePng(width, height, { noise = false } = {}) {
  const bytesPerRow = width * 3 + 1
  const raw = Buffer.alloc(bytesPerRow * height)
  for (let y = 0; y < height; y++) {
    raw[y * bytesPerRow] = 0 // filtre PNG "None"
    for (let x = 0; x < width; x++) {
      const i = y * bytesPerRow + 1 + x * 3
      if (noise) {
        raw[i] = (Math.random() * 256) | 0
        raw[i + 1] = (Math.random() * 256) | 0
        raw[i + 2] = (Math.random() * 256) | 0
      } else {
        raw[i] = ((x * 255) / width) | 0
        raw[i + 1] = ((y * 255) / height) | 0
        raw[i + 2] = 128
      }
    }
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0)
    return Buffer.concat([len, typeBuf, data, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // profondeur 8 bits
  ihdr[9] = 2 // type couleur RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, noise ? { level: 0 } : {})),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function makePdf() {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
      'trailer<</Root 1 0 R>>\n%%EOF'
  )
}

export function uploadForm(buffer, { type = 'image/png', name = 'test.png', fields = {} } = {}) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  fd.append('file', new Blob([buffer], { type }), name)
  return fd
}
