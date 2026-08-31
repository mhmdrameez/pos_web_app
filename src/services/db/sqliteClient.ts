/**
 * sqliteClient.ts
 *
 * Promise-based bridge between the main thread and sqlite.worker.ts.
 * Exposes three operations:
 *   sqlRun(sql, params?)          – execute a DML/DDL statement (no rows returned)
 *   sqlQuery<T>(sql, params?)     – SELECT, returns typed rows
 *   sqlTransaction(ops)           – run multiple statements atomically
 *
 * Initialisation:
 *   Call `initSQLiteClient()` once at app startup and await the returned promise
 *   before making any DB calls. The worker signals readiness via a 'ready' message.
 */

type SqlValue = string | number | null | undefined

interface TxOp { sql: string; params?: SqlValue[] }

interface WorkerOkResponse  { id: number; ok: true;  rows?: Record<string, SqlValue>[] }
interface WorkerErrResponse { id: number; ok: false; error: string }
type WorkerResponse = WorkerOkResponse | WorkerErrResponse

// ── Worker singleton ─────────────────────────────────────────────────────────

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

export function initSQLiteClient(): Promise<void> {
  return new Promise((resolve, reject) => {
    worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as WorkerResponse & { type?: string }

      // Startup signals
      if (data.type === 'ready') {
        resolve()
        return
      }
      if (data.type === 'error') {
        reject(new Error((data as { error?: string }).error ?? 'SQLite worker failed to start'))
        return
      }

      // Regular request replies
      const pending_ = pending.get(data.id)
      if (!pending_) return
      pending.delete(data.id)

      if (data.ok) {
        pending_.resolve((data as WorkerOkResponse).rows ?? null)
      } else {
        pending_.reject(new Error((data as WorkerErrResponse).error))
      }
    }

    worker.onerror = (err) => {
      reject(new Error(err.message))
    }
  })
}

// ── Low-level send helper ────────────────────────────────────────────────────

function send<T>(msg: object): Promise<T> {
  if (!worker) throw new Error('SQLite client not initialised – call initSQLiteClient() first')
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
    })
    worker!.postMessage({ id, ...msg })
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Execute a statement that does not return rows (INSERT, UPDATE, DELETE, etc.). */
export function sqlRun(sql: string, params?: SqlValue[]): Promise<void> {
  return send({ type: 'run', sql, params })
}

/** Execute a SELECT and return typed rows. */
export function sqlQuery<T = Record<string, SqlValue>>(
  sql: string,
  params?: SqlValue[],
): Promise<T[]> {
  return send<T[]>({ type: 'query', sql, params })
}

/** Run multiple statements inside a single SQLite transaction. */
export function sqlTransaction(ops: TxOp[]): Promise<void> {
  return send({ type: 'transaction', ops })
}
