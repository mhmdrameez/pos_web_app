import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSQLiteClient } from './services/db/sqliteClient'
import { initializeDatabase } from './services/db/database'
import { runDexieMigrationIfNeeded } from './services/db/dexieMigration'
import { startDailyDigestScheduler } from './services/email/dailyDigestScheduler'
import { startDailyBackupScheduler } from './services/backup/autoBackupScheduler'

// Initialise the SQLite database (Web Worker + OPFS) before mounting React.
// The UI renders a loading state until isDbReady is set by App/useAppStore.
initSQLiteClient()
  .then(() => initializeDatabase())
  .then(() => runDexieMigrationIfNeeded())
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch((err: unknown) => {
    console.error('[Boot] Failed to initialise SQLite database:', err)
    // Render anyway — the app will show an error state or work in degraded mode
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })

// Start background schedulers
startDailyDigestScheduler()
startDailyBackupScheduler()

// Prevent pull-to-refresh on tablet/mobile touch devices
let touchStartY = 0
window.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY
    }
  },
  { passive: true }
)

window.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length === 1) {
      const touchY = e.touches[0].clientY
      const touchDiff = touchY - touchStartY

      // Prevent pulling down from top of page which triggers pull-to-refresh reload
      if (touchDiff > 0 && window.scrollY <= 0) {
        let target = e.target as HTMLElement | null
        let isInternalScroll = false
        while (target && target !== document.body && target !== document.documentElement) {
          if (target.scrollTop > 0) {
            isInternalScroll = true;
            break
          }
          target = target.parentElement
        }
        if (!isInternalScroll && e.cancelable) {
          e.preventDefault()
        }
      }
    }
  },
  { passive: false }
)
