import * as assert from 'node:assert/strict'

import { SEED_ROWS } from '../src/data/seed'
import {
  FERMENT_MAX_DAYS,
  fermentDaysBetween,
  locatePitsIn,
  parseDateOnly,
  type EntryRow,
  type PitLocatorQuery,
} from '../src/data/pit-domain'

const rows: EntryRow[] = SEED_ROWS.pit
const baseQuery: PitLocatorQuery = {
  code: '',
  fermentDays: '',
  leachateBand: '',
  order: 'desc',
  page: 1,
  size: 5,
}

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log('✓', name)
}

// 1. 发酵天数：从倒料日期算，跨天整日，历史池区按当时口径保留
check('发酵天数同一天为 0，跨天为整日差', () => {
  assert.equal(fermentDaysBetween('2026-10-07', '2026-10-07'), 0)
  assert.equal(fermentDaysBetween('2026-09-25', '2026-10-07'), 12)
  assert.equal(fermentDaysBetween('2026-09-20', '2026-09-30'), 10)
})

check('历史池区 PIT-113 的 10 天按 2026-09-30 口径固化，不被今天重算成 17', () => {
  const pit113 = rows.find((r) => r['池区编号'] === 'PIT-113')!
  assert.equal(pit113['发酵天数'], 10)
  assert.equal(pit113['口径日期'], '2026-09-30')
  assert.equal(fermentDaysBetween('2026-09-20', '2026-10-07'), 17)
})

// 2. 默认按发酵天数降序
check('默认按发酵天数从多到少排序', () => {
  const page = locatePitsIn(rows, baseQuery)
  const days = page.items.map((r) => Number(r['发酵天数']))
  assert.deepEqual(days, [...days].sort((a, b) => b - a))
})

check('可切换为发酵天数升序', () => {
  const page = locatePitsIn(rows, { ...baseQuery, order: 'asc' })
  const days = page.items.map((r) => Number(r['发酵天数']))
  assert.deepEqual(days, [...days].sort((a, b) => a - b))
})

// 3. 翻页：同条件、不重复、条数对得上
check('每页 5 条，三页覆盖 13 条且互不重复，条数 5/5/3', () => {
  const p1 = locatePitsIn(rows, { ...baseQuery, page: 1 })
  const p2 = locatePitsIn(rows, { ...baseQuery, page: 2 })
  const p3 = locatePitsIn(rows, { ...baseQuery, page: 3 })
  assert.equal(p1.total, 13)
  assert.equal(p1.pages, 3)
  assert.equal(p1.items.length, 5)
  assert.equal(p2.items.length, 5)
  assert.equal(p3.items.length, 3)
  const ids = [...p1.items, ...p2.items, ...p3.items].map((r) => r.id)
  assert.equal(new Set(ids).size, 13)
})

check('超出末页被夹回末页，不返回空页或重复', () => {
  const p = locatePitsIn(rows, { ...baseQuery, page: 99 })
  assert.equal(p.page, 3)
  assert.equal(p.items.length, 3)
})

// 4. 组合条件
check('按池区编号模糊匹配（小写也能查到）', () => {
  const page = locatePitsIn(rows, { ...baseQuery, code: 'pit-101' })
  assert.equal(page.total, 1)
  assert.equal(page.items[0]['池区编号'], 'PIT-101')
})

check('按编号前缀模糊可命中多条', () => {
  const page = locatePitsIn(rows, { ...baseQuery, code: 'PIT-11' })
  assert.deepEqual(
    page.items.map((r) => r['池区编号']).sort(),
    ['PIT-110', 'PIT-111', 'PIT-112', 'PIT-113'],
  )
})

check('发酵天数精确匹配', () => {
  const page = locatePitsIn(rows, { ...baseQuery, fermentDays: '12' })
  assert.equal(page.total, 1)
  assert.equal(page.items[0]['池区编号'], 'PIT-101')
})

check('液位高档 ≥1.5m 与发酵天数组合', () => {
  const page = locatePitsIn(rows, { ...baseQuery, leachateBand: 'high', fermentDays: '' })
  const codes = page.items.map((r) => r['池区编号']).sort()
  assert.deepEqual(codes, ['PIT-101', 'PIT-105', 'PIT-107', 'PIT-112'])
})

check('液位中档 0.8~1.5m', () => {
  const page = locatePitsIn(rows, { ...baseQuery, leachateBand: 'mid' })
  assert.ok(page.items.every((r) => {
    const m = Number(r['渗滤液液位'])
    return m >= 0.8 && m < 1.5
  }))
  assert.equal(page.items.length, 3) // 0.9、1.1、1.4
})

check('液位低档 <0.8m', () => {
  const page = locatePitsIn(rows, { ...baseQuery, leachateBand: 'low' })
  assert.ok(page.items.every((r) => Number(r['渗滤液液位']) < 0.8))
})

check('找不到条件返回 total=0（页面据此给交代，而非空表无说明）', () => {
  const page = locatePitsIn(rows, { ...baseQuery, code: 'PIT-999' })
  assert.equal(page.total, 0)
  assert.equal(page.items.length, 0)
})

// 5. 非法发酵天数拦截，并提示取值范围
check('非法发酵天数（小数/负数/字母/超界）被挡，提示 0~90 整数', () => {
  for (const bad of ['1.5', '-3', 'abc', '91', '100']) {
    assert.throws(
      () => locatePitsIn(rows, { ...baseQuery, fermentDays: bad }),
      (err: unknown) => err instanceof Error && err.message.includes(`0~${FERMENT_MAX_DAYS}`),
      `应拒绝 ${bad}`,
    )
  }
})

check('边界 0 与 90 合法', () => {
  assert.doesNotThrow(() => locatePitsIn(rows, { ...baseQuery, fermentDays: '0' }))
  assert.doesNotThrow(() => locatePitsIn(rows, { ...baseQuery, fermentDays: '90' }))
})

// 6. 同发酵天数有稳定次序（编号、id 兜底）
check('同发酵天数按编号/id 稳定排序，保证翻页不重不漏', () => {
  const tied: EntryRow[] = [
    { id: 2, status: '', pending: false, abnormal: false, 池区编号: 'B', 发酵天数: 5 },
    { id: 1, status: '', pending: false, abnormal: false, 池区编号: 'A', 发酵天数: 5 },
    { id: 3, status: '', pending: false, abnormal: false, 池区编号: 'A', 发酵天数: 5 },
  ]
  const asc = locatePitsIn(tied, { ...baseQuery, order: 'asc', size: 10 })
  assert.deepEqual(asc.items.map((r) => r.id), [1, 3, 2])
})

// 7. 日期解析严格性
check('非法日期字符串解析为 null', () => {
  assert.equal(parseDateOnly('2026-13-01'), null)
  assert.equal(parseDateOnly('2026/10/01'), null)
  assert.equal(parseDateOnly('not-a-date'), null)
})

console.log(`\n全部 ${passed} 项断言通过`)
