import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const UPLOADS_ROOT = path.resolve(__dirname, '../uploads')

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
}

export function makeUploader({ mimes, maxBytes }) {
  const uploader = multer({
    storage: multer.diskStorage({
      destination(req, file, cb) {
        const dir = path.join(UPLOADS_ROOT, String(req.cabinetId))
        fs.mkdirSync(dir, { recursive: true })
        cb(null, dir)
      },
      filename(req, file, cb) {
        // Nom aléatoire : les chemins ne doivent pas être devinables.
        cb(null, crypto.randomUUID() + (EXT_BY_MIME[file.mimetype] ?? ''))
      },
    }),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter(req, file, cb) {
      if (!mimes.includes(file.mimetype)) {
        const err = new Error(`Type de fichier non accepté (${file.mimetype})`)
        err.code = 'BAD_FILE_TYPE'
        return cb(err)
      }
      cb(null, true)
    },
  })

  // Convertit les erreurs multer en réponses JSON cohérentes.
  return (field) => (req, res, next) => {
    uploader.single(field)(req, res, (err) => {
      if (!err) return next()
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: {
            code: 'FILE_TOO_LARGE',
            message: `Fichier trop volumineux (maximum ${Math.round(maxBytes / (1024 * 1024))} Mo)`,
          },
        })
      }
      if (err.code === 'BAD_FILE_TYPE') {
        return res.status(400).json({ error: { code: 'BAD_FILE_TYPE', message: err.message } })
      }
      next(err)
    })
  }
}

export function toRelPath(absolutePath) {
  return path.relative(UPLOADS_ROOT, absolutePath).split(path.sep).join('/')
}

export function toAbsPath(relativePath) {
  return path.join(UPLOADS_ROOT, relativePath)
}

export function deleteFileQuiet(relativePath) {
  if (!relativePath) return
  try {
    fs.unlinkSync(toAbsPath(relativePath))
  } catch {
    // fichier déjà absent : rien à faire
  }
}
