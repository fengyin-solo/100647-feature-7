/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

// 倒料定位结果落到值班交接的「待核对清单」：一条对应一个待倒料池区。
export type ChecklistItem = {
  id: number
  pitId: number
  code: string
  fermentDays: number
  leachateMeter: number
  basisDate: string
  remark: string
  checked: boolean
  createdAt: string
}

export type ChecklistAddResult = {
  added: number
  skipped: number
  items: ChecklistItem[]
}
