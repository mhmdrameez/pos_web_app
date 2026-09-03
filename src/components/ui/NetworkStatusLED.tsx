/**
 * NetworkStatusLED.tsx
 *
 * Real-time network activity monitor.
 * Highly optimized for millisecond precision by bypassing React state
 * for high-frequency updates (TX/RX bytes and LED flashes).
 *
 *  🟢 Green LED — internet ONLINE / pulses on outgoing TX
 *  🔴 Red LED   — internet OFFLINE / pulses on incoming RX
 */

import { useEffect, useRef } from 'react'
import { useAppStore } from '../../stores/useAppStore'

// ── Global Stats & Interceptor ────────────────────────────────────────────────

// We keep a single global source of truth for the stats.
const globalStats = {
  txBytes: 0,
  rxBytes: 0,
  requestCount: 0,
  responseCount: 0,
}

// Set of DOM-manipulating callbacks to trigger immediate UI updates
type FastUpdateCallback = (type: 'tx' | 'rx', bytes: number) => void
const fastListeners = new Set<FastUpdateCallback>()

let interceptorInstalled = false
function installInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') return
  interceptorInstalled = true

  const origFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Estimate outgoing size
    let txBytes = 0
    const body = init?.body
    if (typeof body === 'string')          txBytes = new TextEncoder().encode(body).length
    else if (body instanceof Blob)         txBytes = body.size
    else if (body instanceof ArrayBuffer)  txBytes = body.byteLength
    else if (body instanceof Uint8Array)   txBytes = body.byteLength

    globalStats.txBytes += txBytes
    globalStats.requestCount += 1

    // Notify listeners immediately (sub-millisecond)
    fastListeners.forEach(fn => fn('tx', txBytes))

    try {
      const response = await origFetch(input, init)
      response.clone().blob().then((blob) => {
        globalStats.rxBytes += blob.size
        globalStats.responseCount += 1
        fastListeners.forEach(fn => fn('rx', blob.size))
      }).catch(() => {
        globalStats.responseCount += 1
        fastListeners.forEach(fn => fn('rx', 0))
      })
      return response
    } catch (err) {
      globalStats.responseCount += 1
      fastListeners.forEach(fn => fn('rx', 0))
      throw err
    }
  }
}
installInterceptor()

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b < 1024)         return `${b} B`
  if (b < 1024 * 1024)  return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

// ── Main Component ────────────────────────────────────────────────────────────

export function NetworkStatusLED() {
  const showNetworkLED = useAppStore((s) => s.showNetworkLED)
  const forceOffline   = useAppStore((s) => s.forceOffline)
  
  // DOM Refs for direct manipulation
  const txTextRef = useRef<HTMLSpanElement>(null)
  const rxTextRef = useRef<HTMLSpanElement>(null)
  const txLedRef = useRef<HTMLDivElement>(null)
  const rxLedRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showNetworkLED) return

    let txTimeout: ReturnType<typeof setTimeout> | null = null
    let rxTimeout: ReturnType<typeof setTimeout> | null = null

    // This listener is called directly from the fetch interceptor.
    // It updates the DOM directly, bypassing React renders for 99% millisecond precision.
    const handleFastUpdate: FastUpdateCallback = (type, bytes) => {
      if (type === 'tx') {
        if (txTextRef.current) txTextRef.current.textContent = `↑${fmtBytes(globalStats.txBytes)}`
        if (txLedRef.current) {
          // Retrigger animation
          txLedRef.current.style.animation = 'none'
          void txLedRef.current.offsetHeight // Trigger reflow
          txLedRef.current.style.animation = 'ledPulse 0.4s ease-out'
          
          if (txTimeout) clearTimeout(txTimeout)
          txTimeout = setTimeout(() => {
            if (txLedRef.current) txLedRef.current.style.animation = 'none'
          }, 400)
        }
      } else if (type === 'rx') {
        if (rxTextRef.current) rxTextRef.current.textContent = `↓${fmtBytes(globalStats.rxBytes)}`
        if (rxLedRef.current) {
          rxLedRef.current.style.animation = 'none'
          void rxLedRef.current.offsetHeight
          rxLedRef.current.style.animation = 'ledPulse 0.4s ease-out'
          
          if (rxTimeout) clearTimeout(rxTimeout)
          rxTimeout = setTimeout(() => {
            if (rxLedRef.current) rxLedRef.current.style.animation = 'none'
          }, 400)
        }
      }

      // Update tooltip
      if (containerRef.current) {
        containerRef.current.title = 
          `Internet: ${navigator.onLine && !forceOffline ? 'Online' : 'Offline'}${forceOffline ? ' (forced)' : ''}\n` +
          `Sent ↑: ${fmtBytes(globalStats.txBytes)} (${globalStats.requestCount} req)\n` +
          `Recv ↓: ${fmtBytes(globalStats.rxBytes)} (${globalStats.responseCount} resp)`
      }
    }

    fastListeners.add(handleFastUpdate)
    
    // Initial paint
    if (txTextRef.current) txTextRef.current.textContent = `↑${fmtBytes(globalStats.txBytes)}`
    if (rxTextRef.current) rxTextRef.current.textContent = `↓${fmtBytes(globalStats.rxBytes)}`

    return () => {
      fastListeners.delete(handleFastUpdate)
      if (txTimeout) clearTimeout(txTimeout)
      if (rxTimeout) clearTimeout(rxTimeout)
    }
  }, [showNetworkLED, forceOffline])

  // If hidden from settings, render nothing
  if (!showNetworkLED) return null

  // Effective online = real browser online AND not force-offline
  const effectiveOnline = navigator.onLine && !forceOffline

  const greenBase = effectiveOnline ? '#22c55e' : '#14532d'
  const redBase   = !effectiveOnline ? '#ef4444' : '#450a0a'
  const greenGlow = effectiveOnline ? '0 0 7px 3px rgba(34,197,94,0.8)' : 'none'
  const redGlow   = !effectiveOnline ? '0 0 7px 3px rgba(239,68,68,0.8)' : 'none'

  return (
    <>
      <style>{`
        @keyframes ledPulse {
          0%   { transform: scale(1);   opacity: 1; }
          50%  { transform: scale(1.7); opacity: 0.85; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>

      <div
        ref={containerRef}
        className="flex flex-col items-center gap-1 w-full px-1"
      >
        {/* LED pair */}
        <div className="flex flex-col items-center gap-1">
          <div
            ref={txLedRef}
            title={`TX — Sent: ${fmtBytes(globalStats.txBytes)}`}
            style={{
              width: 10, height: 10, borderRadius: '50%',
              backgroundColor: greenBase,
              boxShadow: greenGlow,
              transition: 'background-color 0.15s, box-shadow 0.15s',
              flexShrink: 0,
            }}
          />
          <div
            ref={rxLedRef}
            title={`RX — Recv: ${fmtBytes(globalStats.rxBytes)}`}
            style={{
              width: 10, height: 10, borderRadius: '50%',
              backgroundColor: redBase,
              boxShadow: redGlow,
              transition: 'background-color 0.15s, box-shadow 0.15s',
              flexShrink: 0,
            }}
          />
        </div>

        {/* KB counters */}
        <div className="flex flex-col items-center gap-px leading-none">
          <span ref={txTextRef} className="text-[7.5px] text-green-500 tabular-nums font-mono">
            ↑{fmtBytes(globalStats.txBytes)}
          </span>
          <span ref={rxTextRef} className="text-[7.5px] text-red-400 tabular-nums font-mono">
            ↓{fmtBytes(globalStats.rxBytes)}
          </span>
        </div>

        {/* Status badge */}
        <span className={`text-[7px] font-bold tracking-wide leading-none ${effectiveOnline ? 'text-green-500' : 'text-red-500'}`}>
          {effectiveOnline ? 'ONLINE' : forceOffline ? 'FORCED' : 'OFFLINE'}
        </span>
      </div>
    </>
  )
}
