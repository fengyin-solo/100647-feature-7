import { moduleMeta, runAction as runGenericAction } from './local-service'
import { listRows, saveRows } from '@/data/local-store'
import {
  DUMP_PENDING_STATUS,
  PIT_PAGE_SIZE,
  buildPitRow,
  countByStatus,
  emptyPitSearchForm,
  filterPits,
  rollFermentDays,
  searchPits,
  validatePitDraft,
  validateSearchForm,
} from '@/data/pit'
import type {
  PitDraft,
  PitPageResult,
  PitSearchForm,
  PitSearchSnapshot,
  PitSortOrder,
} from '@/data/pit'
import type { ActionResult, EntryRow } from '@/data/types'
import { appendHandoverPits } from '@/data/handover-checklist'

const PIT_KEY = 'pit'
// 筛选条件与当前页码持久化在浏览器里，翻页、重开页面都还是同一份条件。
const QUERY_STORAGE_KEY = 'waste-to-energy-plant:pit-query'

// 统计卡片指标到池区状态的对应：指标比状态少一个「待投料」，不能按下标硬对。
const METRIC_STATUS: { label: string; status: string }[] = [
  { label: '发酵中池区', status: '发酵中' },
  { label: '已投料池区', status: '已投料' },
  { label: '需倒料池区', status: '需倒料' },
]

export type PitOverview = {
  stats: { label: string; value: number }[]
  statusSummary: { status: string; count: number }[]
  total: number
}

/**
 * 取数前先滚算发酵天数：跨天的池区按当天口径算一次，历史（已投料）池区结论保留。
 * 只有真的发生滚算才回写本地存储。
 */
function rollAndSave(): EntryRow[] {
  const rows = listRows(PIT_KEY)
  const next = rollFermentDays(rows)
  if (next !== rows) {
    saveRows(PIT_KEY, next)
  }
  return next
}

export function listPits(
  form: PitSearchForm,
  order: PitSortOrder,
  page: number,
): PitPageResult {
  const rows = rollAndSave()
  const snapshot: PitSearchSnapshot = validateSearchForm(form, order)
  return searchPits(rows, snapshot, page)
}

export function getPitOverview(): PitOverview {
  const meta = moduleMeta(PIT_KEY)
  const rows = rollAndSave()
  const counts = countByStatus(rows, meta.statuses)
  return {
    total: rows.length,
    stats: METRIC_STATUS.map(({ label, status }) => ({ label, value: counts[status] ?? 0 })),
    statusSummary: meta.statuses.map((status) => ({ status, count: counts[status] ?? 0 })),
  }
}

/** 登记新池区：编号查重、取值范围校验都在这层，页面不做业务判断。 */
export function registerPit(draft: PitDraft): ActionResult & { id: number } {
  const rows = rollAndSave()
  const codes = rows.map((row) => String(row['池区编号'] ?? ''))
  const valid = validatePitDraft(draft, codes)
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const row = buildPitRow(valid, nextId)
  saveRows(PIT_KEY, [...rows, row])
  return { ok: true, message: `池区 ${valid.code} 已登记，当前状态「待投料」`, id: nextId }
}

export function runPitAction(id: number, action: string): ActionResult {
  const result = runGenericAction(PIT_KEY, id, action)
  if (!result.ok) {
    return result
  }
  // 安排倒料成功的池区自动落到值班交接的待核对清单。
  if (moduleMeta(PIT_KEY).actionTargets[action] === DUMP_PENDING_STATUS) {
    const row = listRows(PIT_KEY).find((item) => Number(item.id) === id)
    if (row) {
      appendHandoverPits([row], new Date().toISOString())
      return {
        ok: true,
        message: `${result.message}，已加入值班交接的待核对清单`,
      }
    }
  }
  return result
}

export type HandoverAppendResult = {
  added: number
  skipped: number
  total: number
}

/** 把当前查询结果里的待倒料池区整批落到交接待核对清单，已在清单里的不重复。 */
export function addDumpPitsToHandover(
  form: PitSearchForm,
  order: PitSortOrder,
): HandoverAppendResult {
  const rows = rollAndSave()
  const snapshot = validateSearchForm(form, order)
  const dumpRows = filterPits(rows, snapshot).filter(
    (row) => String(row.status) === DUMP_PENDING_STATUS,
  )
  const { added } = appendHandoverPits(dumpRows, new Date().toISOString())
  return { added, skipped: dumpRows.length - added, total: dumpRows.length }
}

export type PitQueryState = {
  form: PitSearchForm
  order: PitSortOrder
  page: number
}

function isPitQueryState(value: unknown): value is PitQueryState {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const state = value as Record<string, unknown>
  return (
    typeof state.form === 'object' &&
    state.form !== null &&
    (state.order === 'asc' || state.order === 'desc') &&
    typeof state.page === 'number'
  )
}

export function loadPitQueryState(): PitQueryState | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  const raw = window.localStorage.getItem(QUERY_STORAGE_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isPitQueryState(parsed)) {
      return null
    }
    return {
      form: { ...emptyPitSearchForm(), ...(parsed.form as Partial<PitSearchForm>) },
      order: parsed.order,
      page: parsed.page,
    }
  } catch {
    return null
  }
}

export function savePitQueryState(state: PitQueryState): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  window.localStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify(state))
}

export function clearPitQueryState(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(QUERY_STORAGE_KEY)
  }
}

export { PIT_PAGE_SIZE }
