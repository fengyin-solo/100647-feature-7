// 值班交接「待核对清单」的读写门面：页面不直接碰 localStorage 数据层。
import {
  appendHandoverPits,
  clearHandoverPits,
  listHandoverPits,
  markHandoverPitChecked,
  removeHandoverPit,
} from '@/data/handover-checklist'

export function listChecklist() {
  // 待核对的排前面，已核对的沉底，组内保持加入时的先后。
  return listHandoverPits().sort((a, b) => Number(a.checked) - Number(b.checked))
}

export function setCheckItemChecked(pitId: number, checked: boolean): void {
  markHandoverPitChecked(pitId, checked)
}

export function removeCheckItem(pitId: number): void {
  removeHandoverPit(pitId)
}

export function clearChecklist(): void {
  clearHandoverPits()
}

export { appendHandoverPits }
