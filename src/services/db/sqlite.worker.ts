/**
 * sqlite.worker.ts
 *
 * Runs inside a Web Worker. Loads the official @sqlite.org/sqlite-wasm bundle,
 * opens (or creates) the QuickSalePOS SQLite database via the opfs-sahpool VFS,
 * and processes messages sent from sqliteClient.ts on the main thread.
 *
 * Message protocol (main → worker):
 *   { id, type: 'run',         sql, params }  → { id, ok: true }
 *   { id, type: 'query',       sql, params }  → { id, ok: true, rows }
 *   { id, type: 'transaction', ops }           → { id, ok: true }
 *
 * All error replies: { id, ok: false, error: string }
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

// ── Types ────────────────────────────────────────────────────────────────────

type SqlValue = string | number | null | undefined

interface RunMsg    { id: number; type: 'run';         sql: string; params?: SqlValue[] }
interface QueryMsg  { id: number; type: 'query';       sql: string; params?: SqlValue[] }
interface TxMsg     { id: number; type: 'transaction'; ops: { sql: string; params?: SqlValue[] }[] }
interface ExportMsg { id: number; type: 'export' }

type WorkerMsg = RunMsg | QueryMsg | TxMsg | ExportMsg

// ── DDL ─────────────────────────────────────────────────────────────────────

const DDL = `
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS savedOrders (
  id          TEXT PRIMARY KEY,
  orderNumber TEXT NOT NULL,
  status      TEXT NOT NULL,
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL,
  customer    TEXT,
  items       TEXT NOT NULL,
  subtotalPaise   INTEGER NOT NULL DEFAULT 0,
  discountPaise   INTEGER NOT NULL DEFAULT 0,
  grandTotalPaise INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_savedOrders_status    ON savedOrders(status);
CREATE INDEX IF NOT EXISTS idx_savedOrders_updatedAt ON savedOrders(updatedAt);

CREATE TABLE IF NOT EXISTS completedSales (
  id              TEXT PRIMARY KEY,
  invoiceNumber   TEXT NOT NULL,
  orderNumber     TEXT NOT NULL,
  status          TEXT NOT NULL,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL,
  completedAt     INTEGER NOT NULL,
  customer        TEXT,
  items           TEXT NOT NULL,
  subtotalPaise       INTEGER NOT NULL DEFAULT 0,
  discountPaise       INTEGER NOT NULL DEFAULT 0,
  grandTotalPaise     INTEGER NOT NULL DEFAULT 0,
  paymentMethod       TEXT NOT NULL,
  amountPaidPaise     INTEGER,
  changePaise         INTEGER,
  emailSentAt         INTEGER,
  appliedCouponCode   TEXT,
  issuedCouponCode    TEXT
);
CREATE INDEX IF NOT EXISTS idx_completedSales_completedAt ON completedSales(completedAt);
CREATE INDEX IF NOT EXISTS idx_completedSales_status      ON completedSales(status);

CREATE TABLE IF NOT EXISTS settings (
  id              TEXT PRIMARY KEY,
  businessName    TEXT NOT NULL DEFAULT 'INVOICE',
  emailSettings   TEXT,
  supabaseSettings TEXT,
  backupSettings  TEXT
);

CREATE TABLE IF NOT EXISTS printerSettings (
  id             TEXT PRIMARY KEY,
  paperWidth     INTEGER NOT NULL DEFAULT 58,
  deviceId       TEXT,
  deviceName     TEXT,
  pairedPrinters TEXT,
  showSuggestions INTEGER
);

CREATE TABLE IF NOT EXISTS cart (
  id            TEXT PRIMARY KEY,
  items         TEXT NOT NULL,
  currentAmount TEXT NOT NULL DEFAULT '',
  customer      TEXT,
  discountPaise INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS counters (
  id               TEXT PRIMARY KEY,
  invoiceSequence  INTEGER NOT NULL DEFAULT 0,
  orderSequence    INTEGER NOT NULL DEFAULT 0,
  salesCount       INTEGER NOT NULL DEFAULT 0,
  latestCompletedAt INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS productStats (
  productKey      TEXT PRIMARY KEY,
  displayName     TEXT NOT NULL,
  totalCount      INTEGER NOT NULL DEFAULT 0,
  confirmedCount  INTEGER NOT NULL DEFAULT 0,
  rejectedCount   INTEGER NOT NULL DEFAULT 0,
  minPricePaise   INTEGER NOT NULL DEFAULT 0,
  maxPricePaise   INTEGER NOT NULL DEFAULT 0,
  sumPricePaise   INTEGER NOT NULL DEFAULT 0,
  sumPriceSq      REAL    NOT NULL DEFAULT 0,
  integerQtyCount INTEGER NOT NULL DEFAULT 0,
  decimalQtyCount INTEGER NOT NULL DEFAULT 0,
  lastSoldAt      INTEGER NOT NULL DEFAULT 0,
  recencyMass     REAL    NOT NULL DEFAULT 0,
  observationCount INTEGER NOT NULL DEFAULT 0,
  priceBuckets    TEXT    NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_productStats_lastSoldAt ON productStats(lastSoldAt);

CREATE TABLE IF NOT EXISTS productPairs (
  id         TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  lastSeenAt INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suggestionMeta (
  id          TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  rebuiltAt   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS coupons (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL,
  amountPaise  INTEGER NOT NULL,
  status       TEXT NOT NULL,
  createdAt    INTEGER NOT NULL,
  usedAt       INTEGER,
  expiresAt    INTEGER,
  customerName TEXT
);
CREATE INDEX IF NOT EXISTS idx_coupons_code      ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_status    ON coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_createdAt ON coupons(createdAt);
`

// ── Bootstrap ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null

async function init() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqlite3: any = await (sqlite3InitModule as any)({ print: console.log, printErr: console.error })

  // Prefer the 'opfs' VFS (Origin Private File System) for durable, persistent
  // storage. sqlite3.oo1.OpfsDb uses this VFS internally — NOT 'opfs-sahpool'
  // (which is a separate pool-based VFS that must be explicitly installed via
  // installOpfsSAHPoolVfs()). The 'opfs' VFS is registered automatically by
  // sqlite-wasm when the Worker context is cross-origin isolated
  // (crossOriginIsolated === true), which requires the page to be served with
  // Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.
  const hasOpfs = sqlite3.capi.sqlite3_vfs_find('opfs')

  if (hasOpfs) {
    db = new sqlite3.oo1.OpfsDb('/QuickSalePOS.sqlite3', 'cw')
  } else {
    db = new sqlite3.oo1.DB(':memory:', 'cw')
    console.warn(
      '[SQLite] OPFS not available – using in-memory DB (data will not persist).',
      'Ensure the page is served with COOP/COEP headers and crossOriginIsolated === true.',
    )
  }

  // Run DDL
  db.exec(DDL)

  self.postMessage({ type: 'ready' })
}

// ── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerMsg>) => {
  const msg = event.data

  if (!db) {
    self.postMessage({ id: msg.id, ok: false, error: 'SQLite not initialised yet' })
    return
  }

  try {
    switch (msg.type) {
      case 'run': {
        db.exec({ sql: msg.sql, bind: msg.params ?? [] })
        self.postMessage({ id: msg.id, ok: true })
        break
      }

      case 'query': {
        const rows: Record<string, SqlValue>[] = []
        db.exec({
          sql: msg.sql,
          bind: msg.params ?? [],
          rowMode: 'object',
          callback: (row: Record<string, SqlValue>) => { rows.push(row) },
        })
        self.postMessage({ id: msg.id, ok: true, rows })
        break
      }

      case 'transaction': {
        db.exec('BEGIN')
        try {
          for (const op of msg.ops) {
            db.exec({ sql: op.sql, bind: op.params ?? [] })
          }
          db.exec('COMMIT')
        } catch (err) {
          db.exec('ROLLBACK')
          throw err
        }
        self.postMessage({ id: msg.id, ok: true })
        break
      }

      case 'export': {
        // Checkpoint the WAL into the main database file first so the export
        // contains all committed data, then serialize the entire DB to bytes.
        try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)') } catch { /* non-fatal */ }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const bytes: Uint8Array = db.export() as Uint8Array
        // Transfer the underlying ArrayBuffer (zero-copy) to the main thread.
        self.postMessage({ id: msg.id, ok: true, bytes }, [bytes.buffer])
        break
      }

      default:
        self.postMessage({ id: (msg as WorkerMsg).id, ok: false, error: 'Unknown message type' })
    }
  } catch (err) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// Boot SQLite
void init().catch((err) => {
  console.error('[SQLite Worker] Failed to initialise:', err)
  self.postMessage({ type: 'error', error: String(err) })
})
