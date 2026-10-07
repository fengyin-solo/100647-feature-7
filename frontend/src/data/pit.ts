import type { EntryRow } from './types'

// 垃圾池区业务口径：取值范围、分页条数、字段名都集中在这里，页面与服务不各写一份。
export const PIT_PAGE_SIZE = 5
export const FERMENT_DAYS_MIN = 0
export const FERMENT_DAYS_MAX = 365
export const LEVEL_MIN = 0
export const LEVEL_MAX = 20
export const STORAGE_MIN = 0
export const STORAGE_MAX = 10000
export const TEMP_MIN = -20
export const TEMP_MAX = 100
// 历史池区：确认投料进焚烧炉后结论冻结，发酵天数不再随日期滚算。
export const HISTORICAL_PIT_STATUS = '已投料'
export const DUMP_PENDING_STATUS = '需倒料'
// 每条池区最近一次滚算发酵天数的口径日期，跨天只算一次就靠它判断。
export const SNAPSHOT_DATE_FIELD = '发酵天数快照日期'

export type PitSortOrder = 'asc' | 'desc'

export type PitSearchForm = {
  池区编号: string
  发酵天数最小: string
  发酵天数最大: string
  液位最小: string
  液位最大: string
}

export type PitSearchSnapshot = {
  code: string | null
  daysMin: number | null
  daysMax: number | null
  levelMin: number | null
  levelMax: number | null
  order: PitSortOrder
}

export type PitPageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
  pages: number
  moduleTotal: number
}

// 非法输入不静默吞掉：抛这个错，页面原样保留筛选框内容并展示说明。
export class PitValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PitValidationError'
  }
}

export function emptyPitSearchForm(): PitSearchForm {
  return { 池区编号: '', 发酵天数最小: '', 发酵天数最大: '', 液位最小: '', 液位最大: '' }
}

const INTEGER_RE = /^\d+$/
const DECIMAL2_RE = /^\d+(?:\.\d{1,2})?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function todayString(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseCalendarDate(raw: string): Date | null {
  if (!DATE_RE.test(raw)) {
    return null
  }
  const [year, month, day] = raw.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** 两个日历日相差的天数；倒料日期晚于基准日时按 0 处理。 */
export function dayDiff(from: string, to: string): number | null {
  const start = parseCalendarDate(from)
  const end = parseCalendarDate(to)
  if (!start || !end) {
    return null
  }
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return Math.max(0, diff)
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value.trim())
    return Number.isFinite(num) ? num : null
  }
  return null
}

/**
 * 发酵天数滚算：发酵天数从倒料日期算起。
 * 跨天的池区按当天的口径算一次（同一池区同一天不重复滚算）；
 * 已投料的历史池区按当时结论保留，不再改。
 * 返回引用相同的数组表示无需落库。
 */
export function rollFermentDays(rows: EntryRow[], today: string = todayString()): EntryRow[] {
  let changed = false
  const next = rows.map((row) => {
    if (String(row.status) === HISTORICAL_PIT_STATUS) {
      return row
    }
    if (String(row[SNAPSHOT_DATE_FIELD] ?? '') === today) {
      return row
    }
    const days = dayDiff(String(row['倒料日期'] ?? ''), today)
    if (days === null) {
      return row
    }
    changed = true
    return { ...row, 发酵天数: days, [SNAPSHOT_DATE_FIELD]: today }
  })
  return changed ? next : rows
}

function parseIntegerBound(
  raw: string,
  label: string,
  min: number,
  max: number,
  unit: string,
): number | null {
  const text = raw.trim()
  if (text === '') {
    return null
  }
  if (!INTEGER_RE.test(text)) {
    throw new PitValidationError(
      `${label}只接受 ${min}～${max} 之间的整数（单位：${unit}），「${raw}」不是合法取值，请重新填写`,
    )
  }
  const num = Number(text)
  if (num < min || num > max) {
    throw new PitValidationError(
      `${label}超出取值范围：合法范围为 ${min}～${max}（单位：${unit}），当前填的是 ${num}`,
    )
  }
  return num
}

function parseDecimalBound(
  raw: string,
  label: string,
  min: number,
  max: number,
  unit: string,
): number | null {
  const text = raw.trim()
  if (text === '') {
    return null
  }
  if (!DECIMAL2_RE.test(text)) {
    throw new PitValidationError(
      `${label}只接受 ${min}～${max} 之间、最多两位小数的数值（单位：${unit}），「${raw}」不是合法取值，请重新填写`,
    )
  }
  const num = Number(text)
  if (num < min || num > max) {
    throw new PitValidationError(
      `${label}超出取值范围：合法范围为 ${min}～${max}（单位：${unit}），当前填的是 ${num}`,
    )
  }
  return num
}

export function validateSearchForm(
  form: PitSearchForm,
  order: PitSortOrder,
): PitSearchSnapshot {
  const daysMin = parseIntegerBound(
    form.发酵天数最小,
    '发酵天数下限',
    FERMENT_DAYS_MIN,
    FERMENT_DAYS_MAX,
    '天',
  )
  const daysMax = parseIntegerBound(
    form.发酵天数最大,
    '发酵天数上限',
    FERMENT_DAYS_MIN,
    FERMENT_DAYS_MAX,
    '天',
  )
  if (daysMin !== null && daysMax !== null && daysMin > daysMax) {
    throw new PitValidationError(
      `发酵天数范围不成立：下限 ${daysMin} 天不能大于上限 ${daysMax} 天（取值范围 ${FERMENT_DAYS_MIN}～${FERMENT_DAYS_MAX} 天）`,
    )
  }
  const levelMin = parseDecimalBound(form.液位最小, '渗滤液液位下限', LEVEL_MIN, LEVEL_MAX, '米')
  const levelMax = parseDecimalBound(form.液位最大, '渗滤液液位上限', LEVEL_MIN, LEVEL_MAX, '米')
  if (levelMin !== null && levelMax !== null && levelMin > levelMax) {
    throw new PitValidationError(
      `渗滤液液位范围不成立：下限 ${levelMin} 米不能大于上限 ${levelMax} 米（取值范围 ${LEVEL_MIN}～${LEVEL_MAX} 米）`,
    )
  }
  return {
    code: form.池区编号.trim() === '' ? null : form.池区编号.trim().toLowerCase(),
    daysMin,
    daysMax,
    levelMin,
    levelMax,
    order,
  }
}

function matchPit(row: EntryRow, snapshot: PitSearchSnapshot): boolean {
  if (snapshot.code !== null) {
    const code = String(row['池区编号'] ?? '').trim().toLowerCase()
    if (!code.includes(snapshot.code)) {
      return false
    }
  }
  const days = toNumber(row['发酵天数'])
  if (snapshot.daysMin !== null && (days === null || days < snapshot.daysMin)) {
    return false
  }
  if (snapshot.daysMax !== null && (days === null || days > snapshot.daysMax)) {
    return false
  }
  const level = toNumber(row['渗滤液液位'])
  if (snapshot.levelMin !== null && (level === null || level < snapshot.levelMin)) {
    return false
  }
  if (snapshot.levelMax !== null && (level === null || level > snapshot.levelMax)) {
    return false
  }
  return true
}

export function filterPits(rows: EntryRow[], snapshot: PitSearchSnapshot): EntryRow[] {
  return rows.filter((row) => matchPit(row, snapshot))
}

/** 发酵天数排序，同天数按池区 id 升序兜底，保证翻页时同一份条件取数不重不漏。 */
export function sortPits(rows: EntryRow[], order: PitSortOrder): EntryRow[] {
  const direction = order === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const daysA = toNumber(a['发酵天数'])
    const daysB = toNumber(b['发酵天数'])
    // 历史脏数据导致取不到数值时，统一排到最后，不参与正反向顺序。
    if (daysA === null && daysB === null) {
      return Number(a.id) - Number(b.id)
    }
    if (daysA === null) {
      return 1
    }
    if (daysB === null) {
      return -1
    }
    if (daysA !== daysB) {
      return (daysA - daysB) * direction
    }
    return Number(a.id) - Number(b.id)
  })
}

export function paginatePits(
  rows: EntryRow[],
  page: number,
  size: number = PIT_PAGE_SIZE,
): { items: EntryRow[]; total: number; page: number; pages: number } {
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / size))
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const start = (safePage - 1) * size
  return { items: rows.slice(start, start + size), total, page: safePage, pages }
}

export function searchPits(
  rows: EntryRow[],
  snapshot: PitSearchSnapshot,
  page: number,
): PitPageResult {
  const matched = sortPits(filterPits(rows, snapshot), snapshot.order)
  const result = paginatePits(matched, page)
  return { ...result, size: PIT_PAGE_SIZE, moduleTotal: rows.length }
}

export type PitDraft = {
  code: string
  dumpDate: string
  storage: string
  level: string
  temperature: string
  operator: string
}

export type ValidatedPitDraft = {
  code: string
  dumpDate: string
  storage: number
  level: number
  temperature: number
  operator: string
}

export function validatePitDraft(draft: PitDraft, existingCodes: string[]): ValidatedPitDraft {
  const code = draft.code.trim()
  if (code === '') {
    throw new PitValidationError('池区编号不能为空，请填写后再登记')
  }
  // 同一池区编号不允许重复登记，按编号去空格、不区分大小写判重。
  if (existingCodes.some((item) => item.trim().toLowerCase() === code.toLowerCase())) {
    throw new PitValidationError(`池区编号 ${code} 已登记过，同一池区编号不允许重复登记`)
  }
  const dumpDate = draft.dumpDate.trim()
  if (parseCalendarDate(dumpDate) === null) {
    throw new PitValidationError('倒料日期不合法，请按「YYYY-MM-DD」填写真实日历日期')
  }
  // YYYY-MM-DD 可直接按字符串比早晚；发酵天数不能预支。
  if (dumpDate > todayString()) {
    throw new PitValidationError('倒料日期不能晚于今天，发酵天数要从实际倒料当天算起')
  }
  const storage = parseDecimalBound(draft.storage, '垃圾存量', STORAGE_MIN, STORAGE_MAX, '吨')
  if (storage === null) {
    throw new PitValidationError('垃圾存量不能为空，请填写倒料入池的垃圾吨数')
  }
  const level = parseDecimalBound(draft.level, '渗滤液液位', LEVEL_MIN, LEVEL_MAX, '米')
  if (level === null) {
    throw new PitValidationError('渗滤液液位不能为空，请按池区液位计读数填写')
  }
  const temperature = parseDecimalBound(draft.temperature, '池区温度', TEMP_MIN, TEMP_MAX, '℃')
  if (temperature === null) {
    throw new PitValidationError('池区温度不能为空，请填写当前池区温度')
  }
  const operator = draft.operator.trim()
  if (operator === '') {
    throw new PitValidationError('抓斗操作人不能为空，请填写当班操作人')
  }
  return { code, dumpDate, storage, level, temperature, operator }
}

export function buildPitRow(
  draft: ValidatedPitDraft,
  nextId: number,
  today: string = todayString(),
): EntryRow {
  return {
    id: nextId,
    status: '待投料',
    pending: true,
    abnormal: false,
    池区编号: draft.code,
    垃圾存量: draft.storage,
    // 登记当天就按当时口径算一次，后续跨天只滚算、不重算历史结论。
    发酵天数: dayDiff(draft.dumpDate, today) ?? 0,
    [SNAPSHOT_DATE_FIELD]: today,
    渗滤液液位: draft.level,
    抓斗操作人: draft.operator,
    倒料日期: draft.dumpDate,
    池区温度: draft.temperature,
    池区状态: '正常',
  }
}

export type PitStatusCounts = Record<string, number>

export function countByStatus(rows: EntryRow[], statuses: string[]): PitStatusCounts {
  const counts: PitStatusCounts = Object.fromEntries(statuses.map((status) => [status, 0]))
  for (const row of rows) {
    const status = String(row.status)
    if (status in counts) {
      counts[status] += 1
    }
  }
  return counts
}
