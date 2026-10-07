import {
  FERMENT_MAX_DAYS,
  LEACHATE_BANDS,
  LEACHATE_MAX_M,
  LEACHATE_MIN_M,
  dumpReadyIn,
  fermentDaysBetween,
  fermentDaysOf,
  leachateMeter,
  locatePitsIn,
  parseDateOnly,
  summarizePits,
  todayBasis,
  type LocatedPage,
  type PitLocatorQuery,
  type PitStats,
} from '@/data/pit-domain'
import { listChecklist, saveChecklist } from '@/data/handover-store'
import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, ChecklistAddResult, ChecklistItem, EntryRow } from '@/data/types'

const KEY = 'pit'

// 倒料定位：同一份条件往下取，页与页之间不重不漏，条数对得上。
export function locatePits(query: PitLocatorQuery): LocatedPage {
  return locatePitsIn(listRows(KEY), query)
}

export function pitStats(): PitStats {
  return summarizePits(listRows(KEY))
}

export type StatusCount = { status: string; count: number }

export function pitStatusCounts(): StatusCount[] {
  const rows = listRows(KEY)
  return ['待投料', '发酵中', '已投料', '需倒料'].map((status) => ({
    status,
    count: rows.filter((row) => String(row.status) === status).length,
  }))
}

export type PitDraft = {
  code: string
  stock: string
  leachate: string
  operator: string
  dumpDate: string
  temperature: string
}

export type CreatePitResult = { ok: true; id: number; message: string } | { ok: false; message: string }

// 登记新池区：池区编号唯一；发酵天数按倒料日期在当下口径固化一次。
export function createPit(draft: PitDraft): CreatePitResult {
  const code = draft.code.trim().toUpperCase()
  if (!code) {
    return { ok: false, message: '池区编号不能为空' }
  }
  const rows = listRows(KEY)
  if (rows.some((row) => String(row['池区编号'] ?? '').trim().toUpperCase() === code)) {
    return { ok: false, message: `池区编号 ${code} 已登记，同一池区编号不允许重复登记` }
  }

  const basisDate = todayBasis()
  const dump = parseDateOnly(draft.dumpDate)
  if (!dump) {
    return { ok: false, message: '倒料日期格式应为 YYYY-MM-DD 的合法日期' }
  }
  if (parseDateOnly(basisDate) && dump.getTime() > parseDateOnly(basisDate)!.getTime()) {
    return { ok: false, message: `倒料日期不能晚于口径日期 ${basisDate}` }
  }

  const stock = Number(draft.stock)
  if (!Number.isFinite(stock) || stock < 0) {
    return { ok: false, message: '垃圾存量需为不小于 0 的数字（单位：吨）' }
  }
  const leachate = Number(draft.leachate)
  if (
    !Number.isFinite(leachate) ||
    leachate < LEACHATE_MIN_M ||
    leachate > LEACHATE_MAX_M ||
    !/^\d+(\.\d{1,2})?$/.test(draft.leachate.trim())
  ) {
    return {
      ok: false,
      message: `渗滤液液位取值范围为 ${LEACHATE_MIN_M}~${LEACHATE_MAX_M} 米，最多保留两位小数`,
    }
  }
  const temperature = Number(draft.temperature)
  if (!Number.isFinite(temperature)) {
    return { ok: false, message: '池区温度需为数字（单位：℃）' }
  }
  const operator = draft.operator.trim() || '未指派'

  const fermentDays = fermentDaysBetween(draft.dumpDate.trim(), basisDate)
  if (fermentDays < 0 || fermentDays > FERMENT_MAX_DAYS) {
    return {
      ok: false,
      message: `按倒料日期算出的发酵天数为 ${fermentDays} 天，超出 0~${FERMENT_MAX_DAYS} 天范围，请核对倒料日期`,
    }
  }

  const id = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const row: EntryRow = {
    id,
    status: '待投料',
    pending: true,
    abnormal: false,
    池区编号: code,
    垃圾存量: stock,
    发酵天数: fermentDays,
    口径日期: basisDate,
    渗滤液液位: leachate,
    抓斗操作人: operator,
    倒料日期: draft.dumpDate.trim(),
    池区温度: temperature,
    池区状态: '待投料',
  }
  saveRows(KEY, [...rows, row])
  return {
    ok: true,
    id,
    message: `池区 ${code} 已登记，发酵天数按 ${basisDate} 口径固化为 ${fermentDays} 天`,
  }
}

function nextId(items: ChecklistItem[]): number {
  return items.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1
}

function bandLabel(meter: number): string {
  return LEACHATE_BANDS.find((band) => band.test(meter))?.label.slice(0, 3) ?? ''
}

function buildChecklistItem(row: EntryRow): ChecklistItem {
  const meter = leachateMeter(row)
  const days = fermentDaysOf(row)
  return {
    id: 0,
    pitId: Number(row.id),
    code: String(row['池区编号'] ?? ''),
    fermentDays: days,
    leachateMeter: meter,
    basisDate: String(row['口径日期'] ?? todayBasis()),
    remark: `发酵${days}天，液位${meter}m（${bandLabel(meter)}），倒料定位建议优先安排`,
    checked: false,
    createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
  }
}

/** 把单条待倒料池区落到交接待核对清单；已在清单里未核对的不重复登记。 */
export function addPitToChecklist(pitId: number): ChecklistAddResult {
  const row = listRows(KEY).find((item) => Number(item.id) === pitId)
  if (!row) {
    return { added: 0, skipped: 0, items: listChecklist() }
  }
  const items = listChecklist()
  if (items.some((item) => item.pitId === pitId && !item.checked)) {
    return { added: 0, skipped: 1, items }
  }
  const item = { ...buildChecklistItem(row), id: nextId(items) }
  const next = [...items, item]
  saveChecklist(next)
  return { added: 1, skipped: 0, items: next }
}

/** 把定位结果里所有「需倒料」池区一次性落到交接待核对清单。 */
export function addDumpReadyToChecklist(): ChecklistAddResult {
  const items = [...listChecklist()]
  const waiting = new Set(
    items.filter((item) => !item.checked).map((item) => item.pitId),
  )
  let added = 0
  let skipped = 0
  for (const row of dumpReadyIn(listRows(KEY))) {
    const pitId = Number(row.id)
    if (waiting.has(pitId)) {
      skipped += 1
      continue
    }
    items.push({ ...buildChecklistItem(row), id: nextId(items) })
    waiting.add(pitId)
    added += 1
  }
  saveChecklist(items)
  return { added, skipped, items }
}

// 池区状态流转沿用通用动作口径，这里按 pit 模块校验目标状态。
const ACTION_TARGETS: Record<string, string> = {
  开始发酵: '发酵中',
  确认投料: '已投料',
  安排倒料: '需倒料',
}
const LAST_STATUS = '需倒料'
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function runPitAction(id: number, action: string): ActionResult {
  const target = ACTION_TARGETS[action]
  if (!target) {
    return { ok: false, message: `垃圾池区没有登记「${action}」这个动作` }
  }
  const rows = listRows(KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的垃圾池区` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `池区已经是「${target}」，不用重复操作` }
  }
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== LAST_STATUS,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
    池区状态: target,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(KEY, next)
  return { ok: true, message: `池区已${action}，当前状态「${target}」` }
}
