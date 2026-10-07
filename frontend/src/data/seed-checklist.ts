import type { ChecklistItem } from './types'

// 交接清单初始留一条待核对，现场能直接看到用法。
export const SEED_CHECKLIST: ChecklistItem[] = [
  {
    id: 1,
    pitId: 1,
    code: 'PIT-101',
    fermentDays: 12,
    leachateMeter: 1.8,
    basisDate: '2026-10-07',
    remark: '发酵12天，液位1.8m（高），倒料定位建议优先安排',
    checked: false,
    createdAt: '2026-10-07 08:15',
  },
]
