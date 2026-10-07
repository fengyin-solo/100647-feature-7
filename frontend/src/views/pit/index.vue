<template>
  <section class="page" data-module="pit">
    <header class="page-head">
      <div>
        <h2>垃圾池管理</h2>
        <p class="page-desc">按池区编号、发酵天数与渗滤液液位组合定位该倒料的池区；发酵天数从倒料日期起算并按当时口径固化，结果可落到值班交接待核对清单。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记垃圾池区</button>
        <button class="btn" type="button" @click="exportRows">导出垃圾池管理清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <!-- 倒料定位：组合条件 + 按发酵天数排序 + 翻页沿用同一条件 -->
    <form class="filter-bar locator" @submit.prevent="applyQuery">
      <label class="filter-item">
        <span>池区编号</span>
        <input v-model.trim="draft.code" placeholder="如 PIT-10，支持模糊" />
      </label>
      <label class="filter-item">
        <span>发酵天数（0~90 的整数）</span>
        <input v-model.trim="draft.fermentDays" inputmode="numeric" placeholder="精确匹配，留空不限" />
      </label>
      <label class="filter-item">
        <span>渗滤液液位</span>
        <select v-model="draft.leachateBand">
          <option value="">全部液位</option>
          <option v-for="band in bands" :key="band.value" :value="band.value">{{ band.label }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>按发酵天数排序</span>
        <select v-model="order">
          <option value="desc">天数多的在前（倒料优先）</option>
          <option value="asc">天数少的在前</option>
        </select>
      </label>
      <button class="btn primary" type="submit">查询定位</button>
      <button class="btn ghost" type="button" @click="resetQuery">重置条件</button>
      <button
        class="btn"
        type="button"
        :disabled="!readyCount"
        :title="readyCount ? `把 ${readyCount} 个需倒料池区加入交接清单` : '当前没有需倒料池区'"
        @click="addAllReady"
      >
        待倒料加入交接清单（{{ readyCount }}）
      </button>
    </form>
    <p v-if="filterError" class="error-text locator-error">{{ filterError }}</p>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in page.items" :key="String(row.id)">
          <td>{{ row['池区编号'] ?? '—' }}</td>
          <td>{{ row['垃圾存量'] ?? '—' }}</td>
          <td class="strong">{{ fermentDays(row) }} 天</td>
          <td>{{ row['口径日期'] ?? '—' }}</td>
          <td>
            {{ row['渗滤液液位'] ?? '—' }}m
            <span class="tag" :class="bandClass(row)">{{ bandText(row) }}</span>
          </td>
          <td>{{ row['抓斗操作人'] ?? '—' }}</td>
          <td>{{ row['倒料日期'] ?? '—' }}</td>
          <td>{{ row['池区温度'] ?? '—' }}</td>
          <td>{{ row['池区状态'] ?? '—' }}</td>
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
              v-if="String(row.status) === '需倒料'"
              class="link"
              type="button"
              @click="addOne(row)"
            >
              加入交接待核对
            </button>
          </td>
        </tr>
        <tr v-if="!page.items.length">
          <td :colspan="columns.length + 2" class="empty-state">{{ emptyHint }}</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>符合条件共 {{ page.total }} 条，第 {{ page.page }} / {{ page.pages }} 页，本页 {{ page.items.length }} 条</span>
      <nav class="pager" aria-label="翻页">
        <button class="btn btn-sm" type="button" :disabled="page.page <= 1" @click="goPage(1)">首页</button>
        <button class="btn btn-sm" type="button" :disabled="page.page <= 1" @click="goPage(page.page - 1)">上一页</button>
        <span class="pager-info">{{ page.page }} / {{ page.pages }}</span>
        <button class="btn btn-sm" type="button" :disabled="page.page >= page.pages" @click="goPage(page.page + 1)">下一页</button>
        <button class="btn btn-sm" type="button" :disabled="page.page >= page.pages" @click="goPage(page.pages)">末页</button>
        <label class="page-size">
          每页
          <select v-model.number="size" @change="applyQuery">
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="20">20</option>
          </select>
          条
        </label>
      </nav>
      <span v-if="message" class="ok-text">{{ message }}</span>
    </footer>

    <!-- 登记弹窗 -->
    <div v-if="creating" class="modal-mask" @click.self="closeCreate">
      <div class="modal">
        <h3>登记垃圾池区</h3>
        <p class="modal-tip">发酵天数按「倒料日期 → 口径日期 {{ basisDate }}」自动算一次并固化；池区编号不可与已有记录重复。</p>
        <form class="form-grid" @submit.prevent="submitCreate">
          <label class="form-field">
            <span>池区编号 *</span>
            <input v-model.trim="form.code" placeholder="如 PIT-114" />
          </label>
          <label class="form-field">
            <span>垃圾存量（吨）*</span>
            <input v-model.trim="form.stock" inputmode="decimal" placeholder="如 300" />
          </label>
          <label class="form-field">
            <span>渗滤液液位（0~5m，两位小数）*</span>
            <input v-model.trim="form.leachate" inputmode="decimal" placeholder="如 1.20" />
          </label>
          <label class="form-field">
            <span>抓斗操作人</span>
            <input v-model.trim="form.operator" placeholder="留空记为未指派" />
          </label>
          <label class="form-field">
            <span>倒料日期（YYYY-MM-DD）*</span>
            <input v-model.trim="form.dumpDate" placeholder="如 2026-10-01" />
          </label>
          <label class="form-field">
            <span>池区温度（℃）*</span>
            <input v-model.trim="form.temperature" inputmode="decimal" placeholder="如 40.5" />
          </label>
          <p class="form-preview" v-if="previewDays !== null">按当前倒料日期，发酵天数将固化为 <strong>{{ previewDays }}</strong> 天</p>
          <p v-if="formError" class="error-text">{{ formError }}</p>
          <div class="modal-actions">
            <button class="btn ghost" type="button" @click="closeCreate">取消</button>
            <button class="btn primary" type="submit">确认登记</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadEntries, moduleMeta } from '@/api/local-service'
import {
  addDumpReadyToChecklist,
  addPitToChecklist,
  createPit,
  locatePits,
  pitStats,
  pitStatusCounts,
  runPitAction,
  type PitDraft,
} from '@/api/pit-service'
import {
  LEACHATE_BANDS,
  leachateMeter,
  fermentDaysOf,
  fermentDaysBetween,
  parseDateOnly,
  todayBasis,
  type LeachateBand,
  type LocatedPage,
  type PitLocatorCriteria,
  type SortOrder,
} from '@/data/pit-domain'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('pit')
const columns = ['池区编号', '垃圾存量', '发酵天数', '口径日期', '渗滤液液位', '抓斗操作人', '倒料日期', '池区温度', '池区状态']
const actions = ['开始发酵', '确认投料', '安排倒料']
const bands = LEACHATE_BANDS
const basisDate = todayBasis()
const PAGE_SIZE = 5

const stats = ref(pitStats())
const order = ref<SortOrder>('desc')
const size = ref(PAGE_SIZE)
const currentPage = ref(1)

// 输入框里的草稿条件与已生效条件分开：翻页只沿用「已生效」那份，不会被没点查询的改动带偏。
const draft = reactive<PitLocatorCriteria>({ code: '', fermentDays: '', leachateBand: '' })
const applied = reactive<PitLocatorCriteria>({ code: '', fermentDays: '', leachateBand: '' })

const emptyPage: LocatedPage = { items: [], total: 0, page: 1, size: PAGE_SIZE, pages: 1 }
const page = ref<LocatedPage>({ ...emptyPage })
const filterError = ref('')
const message = ref('')

const hasActiveFilter = computed(() =>
  Boolean(applied.code.trim() || applied.fermentDays.trim() || applied.leachateBand),
)

const emptyHint = computed(() =>
  hasActiveFilter.value
    ? '按当前组合条件没有找到对应的池区：可放宽池区编号、发酵天数或液位档位后再查，不是一张空表。'
    : '暂无垃圾池区数据，可先登记垃圾池区。',
)

const statusSummary = ref(pitStatusCounts())

// 「加入交接清单」按钮用全量需倒料数，避免被当前筛选条件限制。
const readyCount = computed(() => stats.value.find((item) => item.label === '需倒料池区')?.value ?? 0)

function fermentDays(row: EntryRow): number {
  return fermentDaysOf(row)
}

function bandText(row: EntryRow): string {
  const meter = leachateMeter(row)
  if (!Number.isFinite(meter)) return '未分档'
  return LEACHATE_BANDS.find((band) => band.test(meter))?.label.slice(0, 1) ?? '未分档'
}

function bandClass(row: EntryRow): string {
  const meter = leachateMeter(row)
  if (!Number.isFinite(meter)) return 'tag-muted'
  if (meter >= 1.5) return 'tag-high'
  if (meter >= 0.8) return 'tag-mid'
  return 'tag-low'
}

function loadPage() {
  message.value = ''
  page.value = locatePits({
    code: applied.code,
    fermentDays: applied.fermentDays,
    leachateBand: applied.leachateBand as '' | LeachateBand,
    order: order.value,
    page: currentPage.value,
    size: size.value,
  })
  stats.value = pitStats()
  statusSummary.value = pitStatusCounts()
}

function applyQuery() {
  filterError.value = ''
  try {
    // 先用领域规则校验，非法发酵天数在点查询时就挡下并说明范围。
    locatePits({
      code: draft.code,
      fermentDays: draft.fermentDays,
      leachateBand: draft.leachateBand,
      order: order.value,
      page: 1,
      size: size.value,
    })
  } catch (error) {
    filterError.value = error instanceof Error ? error.message : '查询条件有误，请检查后重试'
    return
  }
  applied.code = draft.code
  applied.fermentDays = draft.fermentDays
  applied.leachateBand = draft.leachateBand
  currentPage.value = 1
  loadPage()
}

function goPage(target: number) {
  currentPage.value = target
  // 翻页沿用同一份已生效条件，输入框也保留，不回到全量。
  loadPage()
}

function resetQuery() {
  draft.code = ''
  draft.fermentDays = ''
  draft.leachateBand = ''
  applied.code = ''
  applied.fermentDays = ''
  applied.leachateBand = ''
  order.value = 'desc'
  size.value = PAGE_SIZE
  currentPage.value = 1
  filterError.value = ''
  loadPage()
}

function exportRows() {
  downloadEntries(meta.key)
}

function runAction(action: string, row: EntryRow) {
  message.value = ''
  filterError.value = ''
  const result = runPitAction(Number(row.id), action)
  if (!result.ok) {
    filterError.value = result.message
    return
  }
  message.value = result.message
  loadPage()
}

function addOne(row: EntryRow) {
  const result = addPitToChecklist(Number(row.id))
  message.value = result.added
    ? `池区 ${row['池区编号']} 已加入值班交接待核对清单`
    : `池区 ${row['池区编号']} 已在待核对清单中，不重复登记`
  loadPage()
}

function addAllReady() {
  const result = addDumpReadyToChecklist()
  message.value = `已把 ${result.added} 个需倒料池区加入交接待核对清单`
    + (result.skipped ? `，${result.skipped} 个已在清单中跳过` : '')
  loadPage()
}

// —— 登记 ——
const creating = ref(false)
const formError = ref('')
const form = reactive<PitDraft>({ code: '', stock: '', leachate: '', operator: '', dumpDate: basisDate, temperature: '' })

const previewDays = computed(() => {
  if (!parseDateOnly(form.dumpDate)) return null
  const days = fermentDaysBetween(form.dumpDate, basisDate)
  return days >= 0 ? days : null
})

function openCreate() {
  form.code = ''
  form.stock = ''
  form.leachate = ''
  form.operator = ''
  form.dumpDate = basisDate
  form.temperature = ''
  formError.value = ''
  creating.value = true
}

function closeCreate() {
  creating.value = false
}

function submitCreate() {
  formError.value = ''
  const result = createPit({ ...form })
  if (!result.ok) {
    formError.value = result.message
    return
  }
  creating.value = false
  message.value = result.message
  // 登记后保留当前筛选条件回到第一页附近查看，统计同步刷新。
  currentPage.value = 1
  loadPage()
}

onMounted(loadPage)
</script>
