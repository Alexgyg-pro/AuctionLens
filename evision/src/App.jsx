import { useState, useCallback, useRef } from 'react'
import ImageRecognizer from './components/ImageRecognizer'
import './App.css'

const REFERENCES = [
  { id: 'batman1', src: '/refs/batman1.jpg' },
  { id: 'batman2', src: '/refs/batman2.jpg' },
]

const NOTIFICATION_DURATION = 3000

export default function App() {
  const [notifications, setNotifications] = useState([])
  const nextId = useRef(0)

  const handleRecognized = useCallback(({ id, score }) => {
    const key = nextId.current++
    const label = `${id} — score : ${score.toFixed(4)}`

    setNotifications(prev => [...prev, { key, label }])

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.key !== key))
    }, NOTIFICATION_DURATION)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          <span className="app-title-e">e</span>Vision
        </h1>
        <p className="app-subtitle">Reconnaissance d'images en temps réel</p>
      </header>

      <main className="app-main">
        <ImageRecognizer
          references={REFERENCES}
          onImageRecognized={handleRecognized}
          threshold={0.50}
          cooldown={5000}
          intervalMs={800}
          viewfinderSize={{ width: '70%', height: '70%' }}
          viewfinderColorIdle="#FFFFFF"
          viewfinderColorClose="#FF9900"
          viewfinderColorSuccess="#00CC00"
          debugOverlay={true}
        />
      </main>

      {/* Zone de notifications */}
      <div className="notif-area" aria-live="polite">
        {notifications.map(n => (
          <div key={n.key} className="notif">
            <span className="notif-icon">✓</span>
            <span className="notif-text">Image reconnue : <strong>{n.label}</strong></span>
          </div>
        ))}
      </div>
    </div>
  )
}
