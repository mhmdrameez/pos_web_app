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
