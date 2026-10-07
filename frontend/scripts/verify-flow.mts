// 校验带数据层的完整流程：登记（编号唯一/口径固化）、状态流转、倒料结果落交接清单与去重。
// 运行前由 scripts/transpile-verify.cjs 一并转成 CJS，并注入 localStorage 垫片。
import * as assert from 'node:assert/strict'

import { createPit, addDumpReadyToChecklist, addPitToChecklist, locatePits } from '../src/api/pit-service'
import { handoverChecklist, markChecklistChecked, removeChecklistItem } from '../src/api/handover-service'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log('✓', name)
}

check('新池区编号不能与已有记录重复（大小写不敏感）', () => {
  const dup = createPit({
    code: 'pit-101', stock: '100', leachate: '1.0', operator: '甲', dumpDate: '2026-10-01', temperature: '40',
  })
  assert.equal(dup.ok, false)
  if (!dup.ok) assert.match(dup.message, /不允许重复登记/)
})

check('合法登记成功，发酵天数按倒料日期到口径日期固化为 6 天', () => {
  const res = createPit({
    code: 'PIT-201', stock: '300', leachate: '1.20', operator: '测试员', dumpDate: '2026-10-01', temperature: '40.5',
  })
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.match(res.message, /6 天/)
    const page = locatePits({ code: 'PIT-201', fermentDays: '', leachateBand: '', order: 'desc', page: 1, size: 5 })
    assert.equal(page.total, 1)
    assert.equal(page.items[0]['发酵天数'], 6)
    assert.equal(page.items[0]['口径日期'], '2026-10-07')
  }
})

check('渗滤液液位超范围 / 非两位小数被挡', () => {
  const tooHigh = createPit({ code: 'PIT-202', stock: '1', leachate: '6', operator: '甲', dumpDate: '2026-10-01', temperature: '40' })
  assert.equal(tooHigh.ok, false)
  const tooMany = createPit({ code: 'PIT-203', stock: '1', leachate: '1.234', operator: '甲', dumpDate: '2026-10-01', temperature: '40' })
  assert.equal(tooMany.ok, false)
})

check('倒料日期晚于口径日期被挡', () => {
  const future = createPit({ code: 'PIT-204', stock: '1', leachate: '1', operator: '甲', dumpDate: '2026-10-08', temperature: '40' })
  assert.equal(future.ok, false)
  if (!future.ok) assert.match(future.message, /不能晚于口径日期/)
})

check('需倒料池区批量落交接清单，已存在未核对的跳过不重复', () => {
  const before = handoverChecklist().filter((i) => !i.checked).length
  const result = addDumpReadyToChecklist()
  // 种子里 PIT-101 已在清单，故 added = 需倒料总数 - 1，skipped >= 1
  assert.ok(result.added >= 1, '应至少加入新条目')
  assert.ok(result.skipped >= 1, 'PIT-101 应跳过')
  const after = handoverChecklist().filter((i) => !i.checked).length
  assert.equal(after, before + result.added)

  // 再来一次：全部已在清单，added=0
  const again = addDumpReadyToChecklist()
  assert.equal(again.added, 0)
  assert.ok(again.skipped >= 1)
})

check('单条加入：已核对过的同一池区允许再次加入', () => {
  const list = handoverChecklist()
  const pit101 = list.find((i) => i.code === 'PIT-101')!
  markChecklistChecked(pit101.id, true)
  const re = addPitToChecklist(pit101.pitId)
  assert.equal(re.added, 1)
})

check('清单可移除条目', () => {
  const first = handoverChecklist()[0]
  const n = handoverChecklist().length
  removeChecklistItem(first.id)
  assert.equal(handoverChecklist().length, n - 1)
})

console.log(`\n全部 ${passed} 项流程断言通过`)
