import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startDailyDigestScheduler } from './services/email/dailyDigestScheduler'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Start the 10PM daily digest scheduler in the background
startDailyDigestScheduler()

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
