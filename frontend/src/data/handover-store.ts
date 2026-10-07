import { SEED_CHECKLIST } from './seed-checklist'
import type { ChecklistItem } from './types'

// 值班交接「待核对清单」的本地持久化，与业务登记表分库存放，互不影响。
const STORAGE_KEY = 'waste-to-energy-plant:handover-checklist:v1'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seed(): ChecklistItem[] {
  return clone(SEED_CHECKLIST)
}

function readStorage(): ChecklistItem[] {
  const fallback = seed()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ChecklistItem[]) : fallback
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: ChecklistItem[] | null = null

export function listChecklist(): ChecklistItem[] {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveChecklist(items: ChecklistItem[]): void {
  cache = items
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }
}

export function resetChecklist(): ChecklistItem[] {
  const items = seed()
  saveChecklist(items)
  return items
}
