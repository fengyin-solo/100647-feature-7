import type { EntryRow } from './types'

// 值班交接「待核对清单」：垃圾池查出来的待倒料结果落到这里，交接班逐条核对。
const STORAGE_KEY = 'waste-to-energy-plant:handover-checklist'

export type HandoverCheckItem = {
  pitId: number
  code: string
  dumpDate: string
  fermentDays: string | number
  level: string | number
  storage: string | number
  operator: string
  addedAt: string
  checked: boolean
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isValidItem(value: unknown): value is HandoverCheckItem {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const item = value as Record<string, unknown>
  return typeof item.pitId === 'number' && typeof item.code === 'string'
}

function readStorage(): HandoverCheckItem[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isValidItem)
  } catch {
    return []
  }
}

let cache: HandoverCheckItem[] | null = null

function allItems(): HandoverCheckItem[] {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

function persist(items: HandoverCheckItem[]): void {
  cache = items
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }
}

function toItem(row: EntryRow, addedAt: string): HandoverCheckItem {
  return {
    pitId: Number(row.id),
    code: String(row['池区编号'] ?? ''),
    dumpDate: String(row['倒料日期'] ?? ''),
    fermentDays: (row['发酵天数'] as string | number) ?? '',
    level: (row['渗滤液液位'] as string | number) ?? '',
    storage: (row['垃圾存量'] as string | number) ?? '',
    operator: String(row['抓斗操作人'] ?? ''),
    addedAt,
    checked: false,
  }
}

/** 追加待倒料池区：已在清单里的不重复登记，返回新增条数。 */
export function appendHandoverPits(rows: EntryRow[], addedAt: string): { added: number } {
  const items = allItems()
  const known = new Set(items.map((item) => item.pitId))
  const next = [...items]
  let added = 0
  for (const row of rows) {
    const pitId = Number(row.id)
    if (known.has(pitId)) {
      continue
    }
    known.add(pitId)
    next.push(toItem(row, addedAt))
    added += 1
  }
  persist(next)
  return { added }
}

export function listHandoverPits(): HandoverCheckItem[] {
  return clone(allItems())
}

export function markHandoverPitChecked(pitId: number, checked: boolean): void {
  const next = allItems().map((item) =>
    item.pitId === pitId ? { ...item, checked } : item,
  )
  persist(next)
}

export function removeHandoverPit(pitId: number): void {
  persist(allItems().filter((item) => item.pitId !== pitId))
}

export function clearHandoverPits(): void {
  persist([])
}

export function handoverStorageKey(): string {
  return STORAGE_KEY
}
