import { describe, it, expect } from 'vitest'
import { importBackup } from '../services/db/backupRestore'
import { getCompletedSales, getAllTableRows } from '../services/db/database'

function backupFile(tables: Record<string, unknown>): File {
  const data = {
    version: 1,
    createdAt: '2026-08-29T07:53:29.411Z',
    tables,
  }
  return new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' })
}

describe('importBackup', () => {
  it('imports v1 completed sales whose items are JSON objects, not SQL strings', async () => {
    const file = backupFile({
      completedSales: [
        {
          id: '0072a4c6-2a4f-485e-8e3b-2eaea0ba70af',
          orderNumber: 'ORD-20260827-183413-166',
          invoiceNumber: 'INV-000126',
          createdAt: 1787835853756,
          updatedAt: 1787835853756,
          completedAt: 1787835853756,
          items: [
            {
              id: '44b3e218-926c-4aa3-b092-ea4f19fb4cf9',
              name: '761 x 1',
              unitPricePaise: 76100,
              quantity: 1,
              nameSource: 'auto',
            },
          ],
          subtotalPaise: 76100,
          discountPaise: 0,
          grandTotalPaise: 76100,
          status: 'completed',
          paymentMethod: 'cash',
          amountPaidPaise: 76100,
          changePaise: 0,
        },
      ],
      productStats: [
        {
          productKey: 'socks',
          displayName: 'Socks',
          totalCount: 1,
          confirmedCount: 1,
          rejectedCount: 0,
          minPricePaise: 3000,
          maxPricePaise: 3000,
          sumPricePaise: 3000,
          sumPriceSq: 9000000,
          integerQtyCount: 1,
          decimalQtyCount: 0,
          lastSoldAt: 1787835853756,
          recencyMass: 1,
          observationCount: 1,
          priceBuckets: [{ paise: 3000, count: 1 }],
        },
      ],
    })

    const result = await importBackup(file)

    expect(result.salesCount).toBe(1)
    expect(result.productsCount).toBe(1)

    const sales = await getCompletedSales()
    expect(sales).toHaveLength(1)
    expect(sales[0].invoiceNumber).toBe('INV-000126')
    expect(sales[0].items).toHaveLength(1)
    expect(sales[0].items[0].name).toBe('761 x 1')
    expect(sales[0].items[0].unitPricePaise).toBe(76100)

    const stats = await getAllTableRows('productStats')
    expect(stats).toHaveLength(1)
  })
})
