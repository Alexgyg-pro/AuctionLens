import { useEffect, useRef, useState, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-webgl'
import '@tensorflow/tfjs-backend-cpu'
import * as mobilenet from '@tensorflow-models/mobilenet'
import './ImageRecognizer.css'

// ─── Utilitaires ──────────────────────────────────────────────────────────────

async function initTFBackend() {
  // WebGL (GPU)
  try {
    await tf.setBackend('webgl')
    await tf.ready()
    console.log('[ImageRecognizer] Backend TF.js : webgl')
    return 'webgl'
  } catch { /* continue */ }

  // WASM — import dynamique pour éviter le bug Vite/ESM du worker inline
  try {
    const { setWasmPaths } = await import('@tensorflow/tfjs-backend-wasm')
    setWasmPaths('/tfwasm/')
    await tf.setBackend('wasm')
    await tf.ready()
    console.log('[ImageRecognizer] Backend TF.js : wasm')
    return 'wasm'
  } catch { /* continue */ }

  // CPU — dernier recours
  try {
    await tf.setBackend('cpu')
    await tf.ready()
    console.log('[ImageRecognizer] Backend TF.js : cpu')
    return 'cpu'
  } catch { /* continue */ }

  throw new Error('Aucun backend TensorFlow.js disponible.')
}

function cosineSimilarity(a, b) {
  return tf.tidy(() => {
    const normA = tf.norm(a)
    const normB = tf.norm(b)
    const dot = tf.sum(tf.mul(a, b))
    return tf.div(dot, tf.mul(normA, normB)).dataSync()[0]
  })
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CAMERA_CONSTRAINTS = {
  video: {
    facingMode: { ideal: 'environment' },
    width:  { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function ImageRecognizer({
  references = [],
  onImageRecognized,
  threshold = 0.85,
  cooldown = 5000,
  intervalMs = 800,
  viewfinderSize = { width: '70%', height: '40%' },
  viewfinderColorIdle    = '#FFFFFF',
  viewfinderColorClose   = '#FF9900',
  viewfinderColorSuccess = '#00CC00',
  debugOverlay = true,
}) {
  // États globaux
  const [modelReady,  setModelReady]      = useState(false)
  const [refsReady,   setRefsReady]       = useState(false)
  const [refsLoading, setRefsLoading]     = useState(false)
  const [refsCount,   setRefsCount]       = useState(0)
  const [scanning,    setScanning]        = useState(false)
  const [cameraOn,    setCameraOn]        = useState(false)
  const [error,       setError]           = useState(null)

  // État du viewfinder
  const [vfState,    setVfState]          = useState('idle')  // 'idle' | 'scanning' | 'close' | 'recognized'
  const [bestScore,  setBestScore]        = useState(null)
  const [bestId,     setBestId]           = useState(null)
  const [flash,      setFlash]            = useState(false)

  // Refs internes (ne déclenchent pas de rendu)
  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)  // canvas intermédiaire hors-écran
  const modelRef      = useRef(null)
  const embeddingsRef = useRef([])    // [{ id, tensor }]
  const streamRef     = useRef(null)
  const intervalRef   = useRef(null)
  const cooldownMap   = useRef({})
  const scanningRef   = useRef(false) // copie synchrone pour le callback d'intervalle
  const vfRef         = useRef(null)  // div du viewfinder (pour mesurer ses dimensions)

  // ── 1. Initialisation TF + MobileNet ─────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await initTFBackend()
        const model = await mobilenet.load({ version: 2, alpha: 1.0 })
        if (cancelled) return
        modelRef.current = model
        setModelReady(true)
      } catch (err) {
        if (!cancelled) setError(`Erreur de chargement du modèle : ${err.message}`)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── 2. Précalcul des embeddings de référence ──────────────────────────────

  useEffect(() => {
    if (!modelReady || references.length === 0) return
    let cancelled = false

    ;(async () => {
      embeddingsRef.current.forEach(e => e.tensor.dispose())
      embeddingsRef.current = []
      setRefsReady(false)
      setRefsLoading(true)
      setRefsCount(0)

      const results = []
      for (const ref of references) {
        try {
          const img = new Image()
          await new Promise((res, rej) => {
            img.onload  = res
            img.onerror = () => rej(new Error("Impossible de charger : " + ref.src))
            img.src = ref.src
          })
          if (cancelled) return

          const embedding = tf.tidy(() => {
            const activation = modelRef.current.infer(img, true)
            return activation.clone()
          })
          results.push({ id: ref.id, tensor: embedding })
          if (!cancelled) setRefsCount(results.length)
        } catch (err) {
          console.error("[ImageRecognizer] Echec reference (" + ref.id + ") :", err.message)
        }
      }

      if (!cancelled) {
        embeddingsRef.current = results
        setRefsLoading(false)
        if (results.length > 0) {
          setRefsReady(true)
        } else {
          setError("Aucune image de reference n'a pu etre chargee. Verifiez les fichiers dans public/refs/.")
        }
      }
    })()

    return () => { cancelled = true }
  }, [modelReady, references])

  // ── 3. Gestion caméra ─────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraOn(false)
    setScanning(false)
    scanningRef.current = false
    setVfState('idle')
    setBestScore(null)
    setBestId(null)
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
      streamRef.current = stream
      // On rend d’abord le <video> dans le DOM (cameraOn = true),
      // puis un useEffect s’occupe d’attacher le stream une fois l’élément monté.
      setCameraOn(true)
    } catch (err) {
      const msg = err.name === "NotAllowedError"
        ? "Permission camera refusee. Autorisez l’acces dans les parametres du navigateur."
        : "Impossible d’acceder a la camera : " + err.message
      setError(msg)
    }
  }, [])

  // ── 3b. Attacher le stream au <video> une fois qu'il est monté ───────────
  // cameraOn passe à true → React rend le <video> → cet effet s'exécute → srcObject assigné.

  useEffect(() => {
    if (!cameraOn || !streamRef.current) return
    const video = videoRef.current
    if (!video) return
    video.srcObject = streamRef.current
    video.play().catch(err => console.warn('[ImageRecognizer] play():', err.message))
  }, [cameraOn])

  // ── 4. Analyse du viewfinder ──────────────────────────────────────────────

  const analyzeFrame = useCallback(() => {
    if (!scanningRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const model = modelRef.current
    const embeddings = embeddingsRef.current

    if (!video || video.readyState < 2 || !model || embeddings.length === 0) return
    if (!vfRef.current) return

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return

    // Calcul des coordonnées du viewfinder dans la vidéo
    const vidEl = video.getBoundingClientRect()
    const vfEl  = vfRef.current.getBoundingClientRect()

    // Facteurs d'échelle entre la vidéo affichée et la résolution native
    const scaleX = vw / vidEl.width
    const scaleY = vh / vidEl.height

    const cropX = Math.round((vfEl.left - vidEl.left) * scaleX)
    const cropY = Math.round((vfEl.top  - vidEl.top)  * scaleY)
    const cropW = Math.round(vfEl.width  * scaleX)
    const cropH = Math.round(vfEl.height * scaleY)

    if (cropW <= 0 || cropH <= 0) return

    // Dessiner uniquement la zone du viewfinder sur le canvas intermédiaire
    canvas.width  = cropW
    canvas.height = cropH
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

    // Calcul de l'embedding de la zone
    let frameEmbedding
    try {
      frameEmbedding = tf.tidy(() => {
        const activation = model.infer(canvas, true)
        return activation.clone()
      })
    } catch {
      return
    }

    // Comparaison avec chaque référence
    let best = { id: null, score: -Infinity }
    for (const ref of embeddings) {
      const score = cosineSimilarity(frameEmbedding, ref.tensor)
      if (score > best.score) {
        best = { id: ref.id, score }
      }
    }
    frameEmbedding.dispose()

    setBestScore(best.score)
    setBestId(best.id)

    // Déterminer l'état du viewfinder
    if (best.score >= threshold) {
      const now = Date.now()
      const lastFired = cooldownMap.current[best.id] ?? 0
      if (now - lastFired >= cooldown) {
        cooldownMap.current[best.id] = now
        setVfState('recognized')
        setFlash(true)
        setTimeout(() => setFlash(false), 600)
        onImageRecognized?.({ id: best.id, score: best.score })
      }
    } else if (best.score >= threshold - 0.1) {
      setVfState('close')
    } else {
      setVfState('scanning')
    }
  }, [threshold, cooldown, onImageRecognized])

  // ── 5. Boucle d'analyse ───────────────────────────────────────────────────

  useEffect(() => {
    if (scanning) {
      scanningRef.current = true
      setVfState('scanning')
      intervalRef.current = setInterval(analyzeFrame, intervalMs)
    } else {
      scanningRef.current = false
      clearInterval(intervalRef.current)
      if (cameraOn) setVfState('idle')
    }
    return () => clearInterval(intervalRef.current)
  }, [scanning, intervalMs, analyzeFrame, cameraOn])

  // ── 6. Nettoyage au démontage ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopCamera()
      embeddingsRef.current.forEach(e => e.tensor.dispose())
    }
  }, [stopCamera])

  // ── 7. Couleur du viewfinder ──────────────────────────────────────────────

  const vfColor = (() => {
    if (vfState === 'recognized') return viewfinderColorSuccess
    if (vfState === 'close')      return viewfinderColorClose
    return viewfinderColorIdle
  })()

  const isReady = modelReady && refsReady

  // ── 8. Rendu ──────────────────────────────────────────────────────────────

  return (
    <div className="ir-root">
      {/* Canvas hors-écran pour le rognage */}
      <canvas ref={canvasRef} className="ir-offscreen-canvas" aria-hidden="true" />

      {/* Zone caméra */}
      <div className="ir-camera-wrapper">
        {cameraOn ? (
          <>
            <video
              ref={videoRef}
              className="ir-video"
              playsInline
              muted
              autoPlay
            />

            {/* Viewfinder */}
            <div
              ref={vfRef}
              className={[
                'ir-viewfinder',
                `ir-vf--${vfState}`,
                flash ? 'ir-vf--flash' : '',
              ].join(' ')}
              style={{
                width:  viewfinderSize.width,
                height: viewfinderSize.height,
                '--vf-color': vfColor,
              }}
            >
              {/* Coins décoratifs */}
              <span className="ir-corner ir-corner--tl" />
              <span className="ir-corner ir-corner--tr" />
              <span className="ir-corner ir-corner--bl" />
              <span className="ir-corner ir-corner--br" />

              {/* Barre de scan animée */}
              {vfState === 'scanning' && (
                <span className="ir-scan-line" />
              )}
            </div>

            {/* Overlay debug */}
            {debugOverlay && bestScore !== null && (
              <div className="ir-debug-overlay">
                <span className="ir-debug-label">Score</span>
                <span className="ir-debug-value">{bestScore.toFixed(4)}</span>
                {bestId && (
                  <span className="ir-debug-id">{bestId}</span>
                )}
                <span className={`ir-debug-state ir-debug-state--${vfState}`}>
                  {vfState}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="ir-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p>Caméra désactivée</p>
          </div>
        )}
      </div>

      {/* Barre de statut */}
      <div className="ir-status-bar">
        {!modelReady && !error && (
          <span className="ir-status ir-status--loading">
            <span className="ir-spinner" />
            Chargement du modele IA…
          </span>
        )}
        {modelReady && refsLoading && !error && (
          <span className="ir-status ir-status--loading">
            <span className="ir-spinner" />
            Calcul des references… ({refsCount}/{references.length})
          </span>
        )}
        {isReady && !cameraOn && !error && (
          <span className="ir-status ir-status--ready">
            {references.length} reference(s) chargee(s) — activez la camera
          </span>
        )}
        {isReady && cameraOn && !scanning && (
          <span className="ir-status ir-status--idle">Camera active — appuyez sur Scanner</span>
        )}
        {isReady && cameraOn && scanning && (
          <span className="ir-status ir-status--scanning">Analyse en cours…</span>
        )}
        {error && (
          <span className="ir-status ir-status--error">{error}</span>
        )}
      </div>

      {/* Contrôles */}
      <div className="ir-controls">
        {!cameraOn ? (
          <button
            className="ir-btn ir-btn--primary"
            onClick={startCamera}
            disabled={!isReady}
          >
            {isReady ? 'Activer la caméra' : 'Chargement…'}
          </button>
        ) : (
          <>
            <button
              className={`ir-btn ${scanning ? 'ir-btn--danger' : 'ir-btn--primary'}`}
              onClick={() => setScanning(s => !s)}
            >
              {scanning ? 'Arrêter le scan' : 'Scanner'}
            </button>
            <button
              className="ir-btn ir-btn--secondary"
              onClick={stopCamera}
            >
              Couper la caméra
            </button>
          </>
        )}
      </div>
    </div>
  )
}
