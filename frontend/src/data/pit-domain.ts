import type { EntryRow } from './types'

/**
 * 垃圾池「倒料定位」专用领域层。
 * 这里只放纯逻辑与常量（不碰 localStorage / window），方便直接拿到 node 里验证；
 * 页面与数据层在外面组合使用，将来把这层换成后端调用时页面不用动。
 */

// —— 发酵天数：从倒料日期算起的口径 ——
// 发酵天数只允许填 0~90 的整数（天），跨天按整日差计算；
// 每条池区在登记/重算的当天按当时口径固化一次，之后翻页、刷新都不再随今天滚动。
export const FERMENT_MIN_DAYS = 0
export const FERMENT_MAX_DAYS = 90

// 渗滤液液位按米登记，保留两位小数，超过 5 米视为录入错误。
export const LEACHATE_MIN_M = 0
export const LEACHATE_MAX_M = 5

// 渗滤液液位分档：定位查询按档组合，避免现场记小数。
export type LeachateBand = 'low' | 'mid' | 'high'

export const LEACHATE_BANDS: { value: LeachateBand; label: string; test: (meter: number) => boolean }[] = [
  { value: 'low', label: '低液位（<0.8m）', test: (m) => m < 0.8 },
  { value: 'mid', label: '中液位（0.8~1.5m）', test: (m) => m >= 0.8 && m < 1.5 },
  { value: 'high', label: '高液位（≥1.5m）', test: (m) => m >= 1.5 },
]

export type SortOrder = 'desc' | 'asc'

// 定位查询的组合条件：三个条件任意组合，留空即不参与筛选。
export type PitLocatorCriteria = {
  code: string
  fermentDays: string
  leachateBand: '' | LeachateBand
}

export type PitLocatorQuery = PitLocatorCriteria & {
  order: SortOrder
  page: number
  size: number
}

export type LocatedPage = {
  items: EntryRow[]
  total: number
  page: number
  size: number
  pages: number
}

export type PitStats = { label: string; value: number }[]

/** 把任意输入解析成发酵天数；非法返回 null，交给上层按口径拦下并提示范围。 */
export function parseFermentDays(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) {
    return null
  }
  const value = Number(text)
  if (!Number.isSafeInteger(value)) {
    return null
  }
  return value
}

/** 校验发酵天数筛选值：非法时抛出带取值范围的说明。 */
export function assertFermentDays(raw: string): number | '' {
  const text = raw.trim()
  if (text === '') {
    return ''
  }
  const value = parseFermentDays(text)
  if (value === null || value < FERMENT_MIN_DAYS || value > FERMENT_MAX_DAYS) {
    throw new Error(`发酵天数取值范围为 ${FERMENT_MIN_DAYS}~${FERMENT_MAX_DAYS} 的整数（单位：天），请修改后再查询`)
  }
  return value
}

/** 严格解析 YYYY-MM-DD，避免 new Date 的时区/宽松解析问题。 */
export function parseDateOnly(raw: string): Date | null {
  const text = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null
  }
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const same =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  return same ? date : null
}

export function todayBasis(): string {
  return '2026-10-07'
}

/** 发酵天数 = 口径日期 - 倒料日期 的跨整日数（同一天倒料算 0 天）。 */
export function fermentDaysBetween(dumpDate: string, basisDate: string): number {
  const start = parseDateOnly(dumpDate)
  const end = parseDateOnly(basisDate)
  if (!start || !end) {
    return 0
  }
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
}

export function leachateMeter(row: EntryRow): number {
  const value = Number(row['渗滤液液位'])
  return Number.isFinite(value) ? value : NaN
}

export function fermentDaysOf(row: EntryRow): number {
  const value = parseFermentDays(String(row['发酵天数'] ?? ''))
  return value ?? 0
}

function matchCode(row: EntryRow, code: string): boolean {
  if (!code) return true
  return String(row['池区编号'] ?? '').toLowerCase().includes(code.toLowerCase())
}

function matchFerment(row: EntryRow, days: number | ''): boolean {
  if (days === '') return true
  return fermentDaysOf(row) === days
}

function matchBand(row: EntryRow, band: '' | LeachateBand): boolean {
  if (!band) return true
  const meter = leachateMeter(row)
  if (!Number.isFinite(meter)) return false
  return LEACHATE_BANDS.find((item) => item.value === band)?.test(meter) ?? false
}

/** 按发酵天数稳定排序：同天数再按池区编号、id 兜底，保证页与页之间不重不漏。 */
function sortRows(rows: EntryRow[], order: SortOrder): EntryRow[] {
  const factor = order === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const diff = (fermentDaysOf(a) - fermentDaysOf(b)) * factor
    if (diff !== 0) return diff
    const codeA = String(a['池区编号'] ?? '')
    const codeB = String(b['池区编号'] ?? '')
    if (codeA !== codeB) return codeA < codeB ? -1 : 1
    return Number(a.id) - Number(b.id)
  })
}

/** 纯函数版定位查询：同一组条件 + 同一页码取数，结果稳定、条数可对上。 */
export function locatePitsIn(source: EntryRow[], query: PitLocatorQuery): LocatedPage {
  const code = query.code.trim()
  const days = assertFermentDays(query.fermentDays)

  const matched = source.filter(
    (row) => matchCode(row, code) && matchFerment(row, days) && matchBand(row, query.leachateBand),
  )
  const ordered = sortRows(matched, query.order)

  const size = Math.max(1, Math.floor(query.size) || 1)
  const total = ordered.length
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(Math.max(1, query.page), pages)
  const start = (page - 1) * size
  return { items: ordered.slice(start, start + size), total, page, size, pages }
}

/** 当前已判为「需倒料」的池区（倒料定位结果落到交接清单的取数口径）。 */
export function dumpReadyIn(source: EntryRow[]): EntryRow[] {
  return source.filter((row) => String(row.status) === '需倒料')
}

export function summarizePits(source: EntryRow[]): PitStats {
  const count = (status: string) =>
    source.filter((row) => String(row.status) === status).length
  return [
    { label: '发酵中池区', value: count('发酵中') },
    { label: '已投料池区', value: count('已投料') },
    { label: '需倒料池区', value: count('需倒料') },
  ]
}
