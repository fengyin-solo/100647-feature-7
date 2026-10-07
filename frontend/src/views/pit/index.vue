<template>
  <section class="page" data-module="pit">
    <header class="page-head">
      <div>
        <h2>垃圾池管理</h2>
        <p class="page-desc">
          池区一多，记不住哪座该倒料：按池区编号、发酵天数与渗滤液液位组合定位，结果按发酵天数排序翻页；
          发酵天数从倒料日期算起，跨天只按当天口径滚算一次，已投料的历史池区结论保留。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记垃圾池区</button>
        <button class="btn" type="button" @click="exportRows">导出垃圾池管理清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in overview.stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in overview.statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="search">
      <label class="filter-item">
        <span>池区编号</span>
        <input v-model="form.池区编号" placeholder="如 PIT-0010，支持部分匹配" />
      </label>
      <label class="filter-item">
        <span>发酵天数（{{ FERMENT_DAYS_MIN }}～{{ FERMENT_DAYS_MAX }} 天，整数）</span>
        <span class="range-input">
          <input v-model="form.发酵天数最小" inputmode="numeric" placeholder="最小天数" />
          <i class="range-sep">至</i>
          <input v-model="form.发酵天数最大" inputmode="numeric" placeholder="最大天数" />
        </span>
      </label>
      <label class="filter-item">
        <span>渗滤液液位（{{ LEVEL_MIN }}～{{ LEVEL_MAX }} 米，最多两位小数）</span>
        <span class="range-input">
          <input v-model="form.液位最小" inputmode="decimal" placeholder="最低液位" />
          <i class="range-sep">至</i>
          <input v-model="form.液位最大" inputmode="decimal" placeholder="最高液位" />
        </span>
      </label>
      <label class="filter-item">
        <span>按发酵天数排序</span>
        <select v-model="order">
          <option value="desc">天数多 → 少</option>
          <option value="asc">天数少 → 多</option>
        </select>
      </label>
      <button class="btn primary" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div class="toolbar">
      <button class="btn" type="button" @click="addDumpResults">
        将查出的待倒料结果加入交接待核对清单
      </button>
      <span v-if="noticeMessage" class="ok-text">{{ noticeMessage }}</span>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ formatCell(row, column) }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
            <button
              v-if="String(row.status) === DUMP_PENDING_STATUS"
              class="link"
              type="button"
              @click="addOne(row)"
            >
              加入交接清单
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">{{ emptyMessage }}</td>
        </tr>
      </tbody>
    </table>

    <nav v-if="total > 0" class="pagination">
      <button class="btn" type="button" :disabled="page <= 1" @click="goPage(page - 1)">
        上一页
      </button>
      <button
        v-for="p in totalPages"
        :key="p"
        class="btn"
        type="button"
        :class="{ primary: p === page }"
        @click="goPage(p)"
      >
        {{ p }}
      </button>
      <button
        class="btn"
        type="button"
        :disabled="page >= totalPages"
        @click="goPage(page + 1)"
      >
        下一页
      </button>
      <span class="page-jump">
        第 {{ page }} / {{ totalPages }} 页（每页 {{ PIT_PAGE_SIZE }} 条）
      </span>
    </nav>

    <footer class="page-foot">
      <span>符合条件 {{ total }} 条 / 全量 {{ moduleTotal }} 条垃圾池区记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="showRegister" class="modal-mask" @click.self="closeRegister">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pit-register-title">
        <h3 id="pit-register-title">登记垃圾池区</h3>
        <form class="modal-form" @submit.prevent="submitRegister">
          <label class="form-item">
            <span>池区编号</span>
            <input v-model="draft.code" placeholder="如 PIT-0014" />
          </label>
          <label class="form-item">
            <span>倒料日期</span>
            <input v-model="draft.dumpDate" type="date" :max="today" />
          </label>
          <label class="form-item">
            <span>垃圾存量（吨，{{ STORAGE_MIN }}～{{ STORAGE_MAX }}）</span>
            <input v-model="draft.storage" inputmode="decimal" placeholder="如 420" />
          </label>
          <label class="form-item">
            <span>渗滤液液位（米，{{ LEVEL_MIN }}～{{ LEVEL_MAX }}）</span>
            <input v-model="draft.level" inputmode="decimal" placeholder="如 2.35" />
          </label>
          <label class="form-item">
            <span>池区温度（℃，{{ TEMP_MIN }}～{{ TEMP_MAX }}）</span>
            <input v-model="draft.temperature" inputmode="decimal" placeholder="如 55.6" />
          </label>
          <label class="form-item">
            <span>抓斗操作人</span>
            <input v-model="draft.operator" placeholder="当班抓斗操作人姓名" />
          </label>
          <p class="form-hint">
            发酵天数从倒料日期算起：本次登记将记为
            <strong>{{ fermentPreview }}</strong>
            天；之后跨天按当天口径自动滚算一次，历史池区结论保留。
          </p>
          <p v-if="draftError" class="error-text">{{ draftError }}</p>
          <div class="modal-actions">
            <button class="btn" type="button" @click="closeRegister">取消</button>
            <button class="btn primary" type="submit">确认登记</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  PIT_PAGE_SIZE,
  addDumpPitsToHandover,
  clearPitQueryState,
  getPitOverview,
  listPits,
  loadPitQueryState,
  registerPit,
  runPitAction,
  savePitQueryState,
} from '@/api/pit'
import { appendHandoverPits } from '@/api/handover'
import { downloadEntries, moduleMeta } from '@/api/local-service'
import {
  DUMP_PENDING_STATUS,
  FERMENT_DAYS_MAX,
  FERMENT_DAYS_MIN,
  LEVEL_MAX,
  LEVEL_MIN,
  PitValidationError,
  STORAGE_MAX,
  STORAGE_MIN,
  TEMP_MAX,
  TEMP_MIN,
  dayDiff,
  emptyPitSearchForm,
  todayString,
} from '@/data/pit'
import type { PitDraft, PitSearchForm, PitSortOrder } from '@/data/pit'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('pit')
const columns = [
  '池区编号',
  '垃圾存量',
  '发酵天数',
  '渗滤液液位',
  '抓斗操作人',
  '倒料日期',
  '池区温度',
  '池区状态',
]
const actions = ['开始发酵', '确认投料', '安排倒料']
const unitByColumn: Record<string, string> = {
  垃圾存量: ' 吨',
  发酵天数: ' 天',
  渗滤液液位: ' 米',
  池区温度: ' ℃',
}

const rows = ref<EntryRow[]>([])
const total = ref(0)
const totalPages = ref(1)
const page = ref(1)
const moduleTotal = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const form = ref<PitSearchForm>(emptyPitSearchForm())
const order = ref<PitSortOrder>('desc')
const overview = ref(getPitOverview())

const showRegister = ref(false)
const draftError = ref('')
const today = todayString()
const draft = ref<PitDraft>({
  code: '',
  dumpDate: today,
  storage: '',
  level: '',
  temperature: '',
  operator: '',
})

const emptyMessage = computed(() => {
  if (moduleTotal.value === 0) {
    return '暂无垃圾池区数据，可先点右上角「登记垃圾池区」建立第一座池区'
  }
  return (
    '没有找着符合条件的池区：按当前池区编号、发酵天数（' +
    `${FERMENT_DAYS_MIN}～${FERMENT_DAYS_MAX} 天）与渗滤液液位（${LEVEL_MIN}～${LEVEL_MAX} 米）的组合查不到记录，` +
    '请放宽或重置条件后再查'
  )
})

const fermentPreview = computed(() => {
  const value = draft.value.dumpDate
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) {
    return '—'
  }
  const diff = dayDiff(value, today)
  return diff === null ? '—' : diff
})

function formatCell(row: EntryRow, column: string): string {
  const value = row[column]
  if (value === undefined || value === null || value === '') {
    return '—'
  }
  return `${value}${unitByColumn[column] ?? ''}`
}

function persistQuery(): void {
  savePitQueryState({ form: { ...form.value }, order: order.value, page: page.value })
}

// 翻页按同一份条件往下取：本页只沿用已生效条件，条件留在筛选框里不回全量。
function reload(): void {
  errorMessage.value = ''
  try {
    const payload = listPits(form.value, order.value, page.value)
    rows.value = payload.items
    total.value = payload.total
    totalPages.value = payload.pages
    moduleTotal.value = payload.moduleTotal
    page.value = payload.page
    persistQuery()
  } catch (error) {
    // 非法发酵天数挡下来：条件原样保留在框里，给出取值范围说明。
    errorMessage.value =
      error instanceof PitValidationError
        ? error.message
        : error instanceof Error
          ? error.message
          : '垃圾池区列表读取失败'
    persistQuery()
  }
  overview.value = getPitOverview()
}

function search(): void {
  noticeMessage.value = ''
  page.value = 1
  reload()
}

function goPage(target: number): void {
  noticeMessage.value = ''
  page.value = target
  reload()
}

function resetFilters(): void {
  noticeMessage.value = ''
  form.value = emptyPitSearchForm()
  order.value = 'desc'
  page.value = 1
  clearPitQueryState()
  reload()
}

function exportRows(): void {
  downloadEntries(meta.key)
}

function openCreate(): void {
  draftError.value = ''
  draft.value = { code: '', dumpDate: today, storage: '', level: '', temperature: '', operator: '' }
  showRegister.value = true
}

function closeRegister(): void {
  showRegister.value = false
  draftError.value = ''
}

function submitRegister(): void {
  draftError.value = ''
  try {
    const result = registerPit(draft.value)
    showRegister.value = false
    noticeMessage.value = result.message
    page.value = 1
    reload()
  } catch (error) {
    draftError.value =
      error instanceof PitValidationError ? error.message : '垃圾池区登记失败，请稍后重试'
  }
}

function runAction(action: string, row: EntryRow): void {
  noticeMessage.value = ''
  errorMessage.value = ''
  const result = runPitAction(Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reload()
}

function addDumpResults(): void {
  errorMessage.value = ''
  try {
    const result = addDumpPitsToHandover(form.value, order.value)
    if (result.total === 0) {
      noticeMessage.value = '当前查询结果里没有「需倒料」状态的池区，暂无可加入交接清单的条目'
      return
    }
    noticeMessage.value = `已把 ${result.added} 条待倒料池区加入值班交接待核对清单，${result.skipped} 条已在清单中未重复加入`
  } catch (error) {
    errorMessage.value =
      error instanceof PitValidationError ? error.message : '加入交接清单失败，请稍后重试'
  }
}

function addOne(row: EntryRow): void {
  const { added } = appendHandoverPits([row], new Date().toISOString())
  noticeMessage.value =
    added === 1
      ? `池区 ${row['池区编号']} 已加入值班交接待核对清单`
      : `池区 ${row['池区编号']} 已在待核对清单中，未重复加入`
}

onMounted(() => {
  // 筛选条件与页码带回：翻页之后、刷新重开都还是筛过的那一份，不回到全量。
  const saved = loadPitQueryState()
  if (saved) {
    form.value = saved.form
    order.value = saved.order
    page.value = saved.page
  }
  reload()
})
</script>
