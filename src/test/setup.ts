import '@testing-library/jest-dom'

// The SQLite worker uses OPFS which is unavailable in jsdom.
// Mock the sqliteClient module with a simple in-memory store so that
// database.ts functions work in unit tests without any native SQLite dependency.

import { vi } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

// In-memory table storage
const tables: Record<string, Row[]> = {}

function getTable(name: string): Row[] {
  if (!tables[name]) tables[name] = []
  return tables[name]
}

function getPkField(sql: string): string {
  if (sql.includes('INTO completedSales') || sql.includes('FROM completedSales'))  return 'id'
  if (sql.includes('INTO savedOrders')    || sql.includes('FROM savedOrders'))      return 'id'
  if (sql.includes('INTO settings')       || sql.includes('FROM settings'))         return 'id'
  if (sql.includes('INTO printerSettings')|| sql.includes('FROM printerSettings')) return 'id'
  if (sql.includes('INTO cart')           || sql.includes('FROM cart'))             return 'id'
  if (sql.includes('INTO counters')       || sql.includes('FROM counters'))         return 'id'
  if (sql.includes('INTO productStats')   || sql.includes('FROM productStats'))     return 'productKey'
  if (sql.includes('INTO productPairs')   || sql.includes('FROM productPairs'))     return 'id'
  if (sql.includes('INTO suggestionMeta') || sql.includes('FROM suggestionMeta'))   return 'id'
  if (sql.includes('INTO coupons')        || sql.includes('FROM coupons'))          return 'id'
  return 'id'
}

function getTableName(sql: string): string {
  const m = sql.match(/(?:FROM|INTO|UPDATE|DELETE FROM)\s+(\w+)/i)
  return m?.[1] ?? ''
}

function getColumns(sql: string): string[] {
  const m = sql.match(/\(([^)]+)\)\s*VALUES/i)
  if (!m) return []
  return m[1].split(',').map((c) => c.trim())
}

vi.mock('../services/db/sqliteClient', () => {
  return {
    initSQLiteClient: vi.fn().mockResolvedValue(undefined),

    sqlRun: vi.fn(async (sql: string, params: unknown[] = []) => {
      const tableName = getTableName(sql)
      if (!tableName) return

      if (/^DELETE FROM/i.test(sql.trim())) {
        const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i)
        if (whereMatch && params[0] != null) {
          tables[tableName] = (tables[tableName] ?? []).filter((r) => r[whereMatch[1]] !== params[0])
        } else {
          tables[tableName] = []
        }
        return
      }

      if (/^UPDATE/i.test(sql.trim())) {
        const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i)
        const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i)
        if (setMatch && whereMatch) {
          const setPairs = setMatch[1].split(',').map((p) => p.trim())
          const whereCol = whereMatch[1]
          const paramOffset = params.length - 1
          const whereVal = params[paramOffset]
          const setParams = params.slice(0, paramOffset)
          const tbl = tables[tableName] ?? []
          tbl.forEach((row) => {
            if (row[whereCol] === whereVal) {
              setPairs.forEach((pair, i) => {
                const col = pair.split('=')[0].trim()
                row[col] = setParams[i]
              })
            }
          })
        }
        return
      }

      if (/^INSERT/i.test(sql.trim())) {
        const columns = getColumns(sql)
        if (!columns.length) return
        const row: Row = {}
        columns.forEach((col, i) => { row[col] = params[i] ?? null })
        const pk = getPkField(sql)
        const tbl = getTable(tableName)
        const isReplace = /INSERT OR REPLACE/i.test(sql)
        const existing  = tbl.findIndex((r) => r[pk] === row[pk])
        if (existing >= 0) {
          if (isReplace) tbl[existing] = row
          // IGNORE: skip
        } else {
          tbl.push(row)
        }
        return
      }
    }),

    sqlQuery: vi.fn(async (sql: string, params: unknown[] = []) => {
      const tableName = getTableName(sql)
      if (!tableName) return []
      const tbl = tables[tableName] ?? []

      // WHERE col = ?
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i)
      if (whereMatch && params.length > 0) {
        const col = whereMatch[1]
        const filtered = tbl.filter((r) => r[col] === params[0])
        return sql.includes('LIMIT 1') ? filtered.slice(0, 1) : filtered
      }

      // WHERE col >= ? AND col <= ?
      const betweenMatch = sql.match(/WHERE\s+(\w+)\s*>=\s*\?\s+AND\s+\1\s*<=\s*\?/i)
      if (betweenMatch && params.length >= 2) {
        const col = betweenMatch[1]
        return tbl.filter((r) => {
          const v = r[col] as number
          return v >= (params[0] as number) && v <= (params[1] as number)
        })
      }

      // WHERE status != 'cancelled'
      if (/status\s*!=\s*'cancelled'/i.test(sql)) {
        const filtered = tbl.filter((r) => r['status'] !== 'cancelled')
        const cnt = filtered.length
        const latest = filtered.reduce((max, r) => Math.max(max, (r['completedAt'] as number) ?? 0), 0)
        if (/COUNT\(\*\)/i.test(sql)) {
          return [{ cnt, latest }]
        }
        return filtered
      }

      // SELECT COUNT(*) AS cnt
      if (/COUNT\(\*\)/i.test(sql)) {
        return [{ cnt: tbl.length, latest: 0 }]
      }

      // status = 'draft'
      if (/status\s*=\s*'draft'/i.test(sql)) {
        return tbl.filter((r) => r['status'] === 'draft')
      }

      // ORDER BY col DESC
      const orderDescMatch = sql.match(/ORDER BY\s+(\w+)\s+DESC/i)
      if (orderDescMatch) {
        const col = orderDescMatch[1]
        return [...tbl].sort((a, b) => ((b[col] as number) ?? 0) - ((a[col] as number) ?? 0))
      }

      return [...tbl]
    }),

    sqlTransaction: vi.fn(async (ops: { sql: string; params?: unknown[] }[]) => {
      for (const op of ops) {
        const tableName = getTableName(op.sql)
        if (!tableName) continue
        if (/^DELETE FROM/i.test(op.sql.trim())) {
          tables[tableName] = []
          continue
        }
        if (/^INSERT/i.test(op.sql.trim())) {
          const columns = getColumns(op.sql)
          if (!columns.length) continue
          const params = op.params ?? []
          const row: Row = {}
          columns.forEach((col, i) => { row[col] = params[i] ?? null })
          const pk = getPkField(op.sql)
          const tbl = getTable(tableName)
          const isReplace = /INSERT OR REPLACE/i.test(op.sql)
          const existing  = tbl.findIndex((r) => r[pk] === row[pk])
          if (existing >= 0) {
            if (isReplace) tbl[existing] = row
          } else {
            tbl.push(row)
          }
        }
      }
    }),
  }
})

// Reset all in-memory tables before each test
beforeEach(() => {
  Object.keys(tables).forEach((k) => { tables[k] = [] })
  localStorage.clear()
})
