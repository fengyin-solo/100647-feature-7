import { listChecklist, resetChecklist, saveChecklist } from '@/data/handover-store'
import type { ActionResult, ChecklistItem } from '@/data/types'

export function handoverChecklist(): ChecklistItem[] {
  return listChecklist()
}

export function markChecklistChecked(id: number, checked: boolean): ActionResult {
  const items = listChecklist()
  const index = items.findIndex((item) => Number(item.id) === id)
  if (index < 0) {
    return { ok: false, message: `待核对清单中没有编号 ${id} 的记录` }
  }
  const next = [...items]
  next[index] = { ...next[index], checked }
  saveChecklist(next)
  return { ok: true, message: checked ? '已标记为核对完成' : '已恢复为待核对' }
}

export function removeChecklistItem(id: number): ActionResult {
  const items = listChecklist()
  const next = items.filter((item) => Number(item.id) !== id)
  if (next.length === items.length) {
    return { ok: false, message: `待核对清单中没有编号 ${id} 的记录` }
  }
  saveChecklist(next)
  return { ok: true, message: '已从待核对清单移除' }
}

export function clearCheckedItems(): ActionResult {
  const items = listChecklist()
  const next = items.filter((item) => !item.checked)
  saveChecklist(next)
  return { ok: true, message: '已清掉核对完成的条目' }
}

export function restoreChecklist(): ChecklistItem[] {
  return resetChecklist()
}
