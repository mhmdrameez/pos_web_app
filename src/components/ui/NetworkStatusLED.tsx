/**
 * NetworkStatusLED.tsx
 *
 * Two LED indicator lights that show real-time network activity:
 *  🟢 Green LED  — pulses on OUTGOING requests (TX) / solid when internet is UP
 *  🔴 Red LED    — pulses on INCOMING responses (RX) / solid when internet is DOWN
 *
 * Also shows total KB sent (↑) and received (↓) since page load,
 * and overall online/offline status.
 *
 * Works by intercepting the global `fetch` via a thin proxy.
 */

import { useEffect, useRef, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface NetStats {
  online: boolean
  txBytes: number   // bytes sent (request bodies)
  rxBytes: number   // bytes received (response bodies)
  txFlash: boolean  // momentary pulse — outgoing request
  rxFlash: boolean  // momentary pulse — incoming response
  requestCount: number
  responseCount: number
}

// ── Fetch interceptor (installed once at module load) ────────────────────────

type StatsListener = (patch: Partial<NetStats>) => void
const listeners = new Set<StatsListener>()

function notify(patch: Partial<NetStats>) {
  listeners.forEach((fn) => {
    try { fn(patch) } catch { /* ignore */ }
  })
}

// Only install the proxy once
let interceptorInstalled = false
function installInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') return
  interceptorInstalled = true

  const origFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Estimate outgoing bytes (body size)
    let txBytes = 0
    if (init?.body) {
      if (typeof init.body === 'string') txBytes = new Blob([init.body]).size
      else if (init.body instanceof Blob) txBytes = init.body.size
      else if (init.body instanceof ArrayBuffer) txBytes = init.body.byteLength
      else if (init.body instanceof Uint8Array) txBytes = init.body.byteLength
    }

    notify({ txFlash: true, txBytes })

    try {
      const response = await origFetch(input, init)

      // Clone and read to measure incoming bytes
      const clone = response.clone()
      clone.blob().then((blob) => {
        notify({ rxFlash: true, rxBytes: blob.size, responseCount: 1 })
      }).catch(() => {
        notify({ rxFlash: true, responseCount: 1 })
      })

      return response
    } catch (err) {
      notify({ rxFlash: true, responseCount: 1 })
      throw err
    }
  }
}
installInterceptor()

// ── Hook ──────────────────────────────────────────────────────────────────────

function useNetworkStats(): NetStats {
  const [stats, setStats] = useState<NetStats>({
    online: navigator.onLine,
    txBytes: 0,
    rxBytes: 0,
    txFlash: false,
    rxFlash: false,
    requestCount: 0,
    responseCount: 0,
  })

  const txTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleOnline()  { setStats((s) => ({ ...s, online: true  })) }
    function handleOffline() { setStats((s) => ({ ...s, online: false })) }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    const listener: StatsListener = (patch) => {
      setStats((prev) => {
        const next = { ...prev }
        if (patch.txBytes)      next.txBytes      += patch.txBytes
        if (patch.rxBytes)      next.rxBytes      += patch.rxBytes
        if (patch.responseCount) next.responseCount += patch.responseCount
        if (patch.txFlash) {
          next.txFlash = true
          next.requestCount += 1
          if (txTimer.current) clearTimeout(txTimer.current)
          txTimer.current = setTimeout(() => {
            setStats((s) => ({ ...s, txFlash: false }))
          }, 400)
        }
        if (patch.rxFlash) {
          next.rxFlash = true
          if (rxTimer.current) clearTimeout(rxTimer.current)
          rxTimer.current = setTimeout(() => {
            setStats((s) => ({ ...s, rxFlash: false }))
          }, 400)
        }
        return next
      })
    }

    listeners.add(listener)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      listeners.delete(listener)
    }
  }, [])

  return stats
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// ── LED dot sub-component ─────────────────────────────────────────────────────

function LedDot({
  color,
  active,
  pulse,
  title,
}: {
  color: 'green' | 'red'
  active: boolean
  pulse: boolean
  title: string
}) {
  const baseColor =
    color === 'green'
      ? active ? '#22c55e' : '#14532d'
      : active ? '#ef4444' : '#450a0a'

  const glowColor =
    color === 'green'
      ? 'rgba(34,197,94,0.7)'
      : 'rgba(239,68,68,0.7)'

  return (
    <div
      title={title}
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: baseColor,
        boxShadow: (active || pulse) ? `0 0 6px 2px ${glowColor}` : 'none',
        transition: 'background-color 0.15s, box-shadow 0.15s',
        flexShrink: 0,
        animation: pulse ? 'ledPulse 0.4s ease-out' : 'none',
      }}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function NetworkStatusLED() {
  const stats = useNetworkStats()

  return (
    <>
      {/* Pulse keyframe — injected once */}
      <style>{`
        @keyframes ledPulse {
          0%   { transform: scale(1);   opacity: 1; }
          50%  { transform: scale(1.6); opacity: 0.8; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>

      <div
        className="flex flex-col items-center gap-1.5 w-full px-1"
        title={
          `Internet: ${stats.online ? 'Online' : 'Offline'}\n` +
          `Sent: ${fmtBytes(stats.txBytes)} (${stats.requestCount} req)\n` +
          `Recv: ${fmtBytes(stats.rxBytes)} (${stats.responseCount} resp)`
        }
      >
        {/* LED pair */}
        <div className="flex flex-col items-center gap-1">
          {/* Green = TX / Online */}
          <LedDot
            color="green"
            active={stats.online}
            pulse={stats.txFlash}
            title={`TX / Online — Sent: ${fmtBytes(stats.txBytes)}`}
          />
          {/* Red = RX / Offline */}
          <LedDot
            color="red"
            active={!stats.online}
            pulse={stats.rxFlash}
            title={`RX / Offline — Recv: ${fmtBytes(stats.rxBytes)}`}
          />
        </div>

        {/* KB counters */}
        <div className="flex flex-col items-center gap-px leading-none">
          <span className="text-[8px] text-green-500 tabular-nums font-mono">
            ↑{fmtBytes(stats.txBytes)}
          </span>
          <span className="text-[8px] text-red-400 tabular-nums font-mono">
            ↓{fmtBytes(stats.rxBytes)}
          </span>
        </div>

        {/* Online / Offline badge */}
        <span
          className={`text-[7px] font-semibold tracking-wide leading-none ${
            stats.online ? 'text-green-500' : 'text-red-500'
          }`}
        >
          {stats.online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
    </>
  )
}
